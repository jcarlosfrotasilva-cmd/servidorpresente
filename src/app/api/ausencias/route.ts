import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { absences, employees, workSchedules } from "@/db/schema";
import {
  ApiError,
  handleRoute,
  ok,
  readJson,
  reqDate,
  reqEnum,
  reqInt,
  reqString,
  reqTime,
} from "@/lib/api";
import { AUSENCIA_TIPOS, type AusenciaTipo } from "@/lib/ausencias";
import { getCurrentUser, logAudit } from "@/lib/session";
import { isValidDateISO, nowLocal } from "@/lib/time";

export const dynamic = "force-dynamic";

const TIPOS = AUSENCIA_TIPOS.map((item) => item.value);
const PERIODOS = ["DIA_INTEIRO", "PARCIAL"] as const;
const STATUS = ["ATIVA", "CANCELADA"] as const;

export async function GET(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "todas";
    const tipo = url.searchParams.get("tipo") ?? "todos";
    const employeeParam = url.searchParams.get("employeeId") ?? "todos";
    const de = url.searchParams.get("de");
    const ate = url.searchParams.get("ate");
    const hoje = nowLocal().date;

    const filters = [];
    if (actor.role === "SERVIDOR") {
      if (!actor.employeeId) throw new ApiError("Usuário sem servidor vinculado.", 400);
      filters.push(eq(absences.employeeId, actor.employeeId));
    } else if (employeeParam !== "todos") {
      filters.push(eq(absences.employeeId, Number(employeeParam)));
    }
    if (status !== "todas") {
      const parsed = reqEnum({ status }, "status", "o status", STATUS);
      if (parsed) filters.push(eq(absences.status, parsed));
    }
    if (tipo !== "todos") {
      const parsed = reqEnum({ tipo }, "tipo", "o tipo", TIPOS);
      if (parsed) filters.push(eq(absences.tipo, parsed));
    }
    if (de && /^\d{4}-\d{2}-\d{2}$/.test(de)) {
      filters.push(gte(absences.dataFim, de));
    }
    if (ate && /^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      filters.push(lte(absences.dataInicio, ate));
    }

    const rows = await db
      .select({
        id: absences.id,
        employeeId: absences.employeeId,
        employeeNome: employees.nome,
        matricula: employees.matricula,
        cargo: employees.cargo,
        tipo: absences.tipo,
        periodo: absences.periodo,
        dataInicio: absences.dataInicio,
        dataFim: absences.dataFim,
        horaInicio: absences.horaInicio,
        horaFim: absences.horaFim,
        motivo: absences.motivo,
        documento: absences.documento,
        status: absences.status,
        createdAt: absences.createdAt,
      })
      .from(absences)
      .innerJoin(employees, eq(absences.employeeId, employees.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(absences.dataInicio), asc(employees.nome))
      .limit(600);

    const servidores = await db
      .select({
        id: employees.id,
        nome: employees.nome,
        matricula: employees.matricula,
        cargo: employees.cargo,
        modeloNome: workSchedules.nome,
      })
      .from(employees)
      .leftJoin(workSchedules, eq(employees.jornadaId, workSchedules.id))
      .where(eq(employees.ativo, true))
      .orderBy(asc(employees.nome));

    const [resumo] = await db
      .select({
        ativas: sql<number>`count(*) filter (where ${absences.status} = 'ATIVA')::int`,
        emCurso: sql<number>`count(*) filter (where ${absences.status} = 'ATIVA' and ${absences.dataInicio} <= ${hoje} and ${absences.dataFim} >= ${hoje})::int`,
        parciais: sql<number>`count(*) filter (where ${absences.periodo} = 'PARCIAL')::int`,
      })
      .from(absences);

    return ok({
      ausencias: rows,
      servidores,
      hoje,
      resumo: {
        ativas: Number(resumo?.ativas ?? 0),
        emCurso: Number(resumo?.emCurso ?? 0),
        parciais: Number(resumo?.parciais ?? 0),
      },
      tipos: AUSENCIA_TIPOS,
      podeEditar: actor.role === "GESTOR",
    });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const body = await readJson(request);
    const employeeId = reqInt(body, "employeeId", "o servidor", { min: 1 });
    const tipo = (reqEnum(body, "tipo", "o tipo de ausência", TIPOS) ?? "OUTROS") as AusenciaTipo;
    const periodo = reqEnum(body, "periodo", "o período", PERIODOS) ?? "DIA_INTEIRO";
    const dataInicio = reqDate(body, "dataInicio", "a data inicial");
    const dataFim = reqDate(body, "dataFim", "a data final") ?? dataInicio;
    const motivo = reqString(body, "motivo", "o motivo/observação", { required: false, max: 500 });
    const documento = reqString(body, "documento", "o documento de referência", {
      required: false,
      max: 160,
    });
    let horaInicio = reqTime(body, "horaInicio", "a hora inicial da ausência", {
      required: periodo === "PARCIAL",
    });
    let horaFim = reqTime(body, "horaFim", "a hora final da ausência", {
      required: periodo === "PARCIAL",
    });

    if (!employeeId || !dataInicio || !dataFim) {
      throw new ApiError("Informe servidor, tipo, data inicial e data final.");
    }
    if (!isValidDateISO(dataInicio) || !isValidDateISO(dataFim)) {
      throw new ApiError("Datas inválidas.");
    }
    if (dataFim < dataInicio) {
      throw new ApiError("A data final não pode ser anterior à data inicial.");
    }

    if (periodo === "PARCIAL") {
      if (dataInicio !== dataFim) {
        throw new ApiError(
          "Ausências parciais devem ocorrer em um único dia. Para vários dias, cadastre uma ausência por dia ou use o período integral.",
        );
      }
      const inicio = Number(horaInicio?.slice(0, 2)) * 60 + Number(horaInicio?.slice(3, 5));
      const fim = Number(horaFim?.slice(0, 2)) * 60 + Number(horaFim?.slice(3, 5));
      if (!(fim > inicio)) {
        throw new ApiError("Na ausência parcial, a hora final deve ser posterior à inicial.");
      }
    } else {
      horaInicio = null;
      horaFim = null;
    }

    const [servidor] = await db
      .select({ id: employees.id, nome: employees.nome })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    if (!servidor) throw new ApiError("Servidor não encontrado.", 404);

    const conflitos = await db
      .select({
        id: absences.id,
        tipo: absences.tipo,
        periodo: absences.periodo,
        dataInicio: absences.dataInicio,
        dataFim: absences.dataFim,
        horaInicio: absences.horaInicio,
        horaFim: absences.horaFim,
      })
      .from(absences)
      .where(
        and(
          eq(absences.employeeId, employeeId),
          eq(absences.status, "ATIVA"),
          lte(absences.dataInicio, dataFim),
          gte(absences.dataFim, dataInicio),
        ),
      );

    const conflitoIntegral = conflitos.find((item) => item.periodo === "DIA_INTEIRO");
    if (conflitoIntegral) {
      throw new ApiError(
        periodo === "DIA_INTEIRO"
          ? "Este servidor já possui ausência registrada em parte do período informado. Cancele o registro anterior antes de lançar a justificativa integral."
          : "Já existe ausência integral no dia informado. Ajuste ou cancele o registro anterior.",
      );
    }

    // Duas ausências parciais sobrepostas reduziriam as horas previstas duas vezes.
    if (periodo === "PARCIAL") {
      const inicioNovo = Number(horaInicio?.slice(0, 2)) * 60 + Number(horaInicio?.slice(3, 5));
      const fimNovo = Number(horaFim?.slice(0, 2)) * 60 + Number(horaFim?.slice(3, 5));
      const sobreposta = conflitos.find((item) => {
        if (item.periodo === "DIA_INTEIRO") return true;
        const inicio = Number(item.horaInicio?.slice(0, 2)) * 60 + Number(item.horaInicio?.slice(3, 5));
        const fim = Number(item.horaFim?.slice(0, 2)) * 60 + Number(item.horaFim?.slice(3, 5));
        return inicioNovo < fim && fimNovo > inicio;
      });
      if (sobreposta) {
        throw new ApiError(
          `Já existe ausência parcial registrada neste dia (${sobreposta.horaInicio?.slice(0, 5)} às ${sobreposta.horaFim?.slice(0, 5)}). Ajuste o registro existente em vez de criar outro no mesmo horário.`,
        );
      }
    }

    const [created] = await db
      .insert(absences)
      .values({
        employeeId,
        tipo,
        periodo,
        dataInicio,
        dataFim,
        horaInicio,
        horaFim,
        motivo: motivo || null,
        documento: documento || null,
        status: "ATIVA",
        createdByUserId: actor.id,
      })
      .returning();

    await logAudit({
      actor,
      action: "CRIAR_AUSENCIA",
      entity: "absences",
      entityId: created.id,
      details: { servidor: servidor.nome, tipo, periodo, dataInicio, dataFim, horaInicio, horaFim },
    });

    return ok({ ausencia: created }, 201);
  });
}
