import { and, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { absences, employees } from "@/db/schema";
import {
  ApiError,
  handleRoute,
  ok,
  parseIdParam,
  readJson,
  reqDate,
  reqEnum,
  reqString,
  reqTime,
} from "@/lib/api";
import { AUSENCIA_TIPOS } from "@/lib/ausencias";
import { getCurrentUser, logAudit } from "@/lib/session";
import { isValidDateISO } from "@/lib/time";

export const dynamic = "force-dynamic";

const TIPOS = AUSENCIA_TIPOS.map((item) => item.value);
const PERIODOS = ["DIA_INTEIRO", "PARCIAL"] as const;
const STATUS = ["ATIVA", "CANCELADA"] as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const current = await db.select().from(absences).where(eq(absences.id, id)).limit(1);
    const ausencia = current[0];
    if (!ausencia) throw new ApiError("Ausência não encontrada.", 404);

    const body = await readJson(request);
    const tipo = reqEnum(body, "tipo", "o tipo de ausência", TIPOS, { required: false }) ?? ausencia.tipo;
    const periodo = reqEnum(body, "periodo", "o período", PERIODOS, { required: false }) ?? ausencia.periodo;
    const dataInicio =
      reqDate(body, "dataInicio", "a data inicial", { required: false }) ?? ausencia.dataInicio;
    const dataFim = reqDate(body, "dataFim", "a data final", { required: false }) ?? ausencia.dataFim;
    const status = reqEnum(body, "status", "o status", STATUS, { required: false }) ?? ausencia.status;
    const motivo = reqString(body, "motivo", "o motivo/observação", { required: false, max: 500 });
    const documento = reqString(body, "documento", "o documento de referência", {
      required: false,
      max: 160,
    });
    let horaInicio = reqTime(body, "horaInicio", "a hora inicial", { required: false }) ?? ausencia.horaInicio;
    let horaFim = reqTime(body, "horaFim", "a hora final", { required: false }) ?? ausencia.horaFim;

    if (!isValidDateISO(dataInicio) || !isValidDateISO(dataFim)) {
      throw new ApiError("Datas inválidas.");
    }
    if (dataFim < dataInicio) {
      throw new ApiError("A data final não pode ser anterior à data inicial.");
    }

    if (periodo === "PARCIAL") {
      if (dataInicio !== dataFim) {
        throw new ApiError("Ausências parciais devem ocorrer em um único dia.");
      }
      if (!horaInicio || !horaFim) {
        throw new ApiError("Informe a hora inicial e final da ausência parcial.");
      }
      const inicio = Number(horaInicio.slice(0, 2)) * 60 + Number(horaInicio.slice(3, 5));
      const fim = Number(horaFim.slice(0, 2)) * 60 + Number(horaFim.slice(3, 5));
      if (!(fim > inicio)) {
        throw new ApiError("Na ausência parcial, a hora final deve ser posterior à inicial.");
      }
    } else {
      horaInicio = null;
      horaFim = null;
    }

    if (status === "ATIVA") {
      const conflitos = await db
        .select({ id: absences.id, periodo: absences.periodo })
        .from(absences)
        .where(
          and(
            eq(absences.employeeId, ausencia.employeeId),
            eq(absences.status, "ATIVA"),
            ne(absences.id, id),
            lte(absences.dataInicio, dataFim),
            gte(absences.dataFim, dataInicio),
          ),
        );
      const integral = conflitos.find((item) => item.periodo === "DIA_INTEIRO");
      if (periodo === "DIA_INTEIRO" && integral) {
        throw new ApiError("Existe outra ausência ativa sobreposta a este período.");
      }
      if (periodo === "PARCIAL" && integral) {
        throw new ApiError("Existe ausência integral ativa no dia informado.");
      }
    }

    const [updated] = await db
      .update(absences)
      .set({
        tipo,
        periodo,
        dataInicio,
        dataFim,
        horaInicio,
        horaFim,
        motivo: motivo || null,
        documento: documento || null,
        status,
        updatedAt: new Date(),
      })
      .where(eq(absences.id, id))
      .returning();

    const [servidor] = await db
      .select({ nome: employees.nome })
      .from(employees)
      .where(eq(employees.id, ausencia.employeeId))
      .limit(1);

    await logAudit({
      actor,
      action: status === "CANCELADA" ? "CANCELAR_AUSENCIA" : "ATUALIZAR_AUSENCIA",
      entity: "absences",
      entityId: id,
      details: {
        servidor: servidor?.nome ?? null,
        tipo,
        periodo,
        dataInicio,
        dataFim,
        horaInicio,
        horaFim,
        status,
      },
    });

    return ok({ ausencia: updated });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const current = await db.select().from(absences).where(eq(absences.id, id)).limit(1);
    const ausencia = current[0];
    if (!ausencia) throw new ApiError("Ausência não encontrada.", 404);

    await db.delete(absences).where(eq(absences.id, id));
    await logAudit({
      actor,
      action: "EXCLUIR_AUSENCIA",
      entity: "absences",
      entityId: id,
      details: {
        tipo: ausencia.tipo,
        periodo: ausencia.periodo,
        dataInicio: ausencia.dataInicio,
        dataFim: ausencia.dataFim,
      },
    });

    return ok({ sucesso: true });
  });
}
