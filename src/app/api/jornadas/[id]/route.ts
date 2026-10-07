import { eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, workSchedules } from "@/db/schema";
import {
  ApiError,
  handleRoute,
  ok,
  parseIdParam,
  readJson,
  reqBool,
  reqInt,
  reqString,
  reqTime,
  reqWeekdays,
} from "@/lib/api";
import { getCurrentUser, logAudit } from "@/lib/session";
import { computeWorkedMinutes, parseTime } from "@/lib/time";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const body = await readJson(request);

    const current = await db
      .select()
      .from(workSchedules)
      .where(eq(workSchedules.id, id))
      .limit(1);
    const jornada = current[0];
    if (!jornada) throw new ApiError("Jornada não encontrada.", 404);

    const nome = reqString(body, "nome", "o nome da jornada", { max: 120 });
    const descricao = reqString(body, "descricao", "a descrição", { required: false, max: 400 });
    const entrada = reqTime(body, "entrada", "o horário de entrada");
    const saidaExpediente = reqTime(body, "saidaExpediente", "o horário de saída");
    const saidaAlmoco = reqTime(body, "saidaAlmoco", "o horário de saída para o almoço", {
      required: false,
    });
    const retornoAlmoco = reqTime(body, "retornoAlmoco", "o horário de retorno do almoço", {
      required: false,
    });
    const toleranciaMin = reqInt(body, "toleranciaMin", "a tolerância em minutos", {
      required: false,
      min: 0,
      max: 120,
    });
    const diasSemana = reqWeekdays(body, "diasSemana", "os dias de trabalho");
    const ativo = reqBool(body, "ativo", jornada.ativo);
    const cargaInformada = reqInt(body, "cargaDiariaMin", "a carga diária", {
      required: false,
      min: 30,
      max: 720,
    });

    if (!entrada || !saidaExpediente) {
      throw new ApiError("Informe os horários de entrada e de saída do expediente.");
    }

    const entradaMin = parseTime(entrada);
    const saidaMin = parseTime(saidaExpediente);
    if (entradaMin != null && saidaMin != null && saidaMin <= entradaMin) {
      throw new ApiError("O horário de saída deve ser posterior ao de entrada.");
    }
    if ((saidaAlmoco && !retornoAlmoco) || (!saidaAlmoco && retornoAlmoco)) {
      throw new ApiError(
        "Informe os dois horários de almoço (saída e retorno) ou nenhum deles.",
      );
    }

    const cargaCalculada = computeWorkedMinutes({
      ENTRADA: entrada,
      SAIDA_ALMOCO: saidaAlmoco,
      RETORNO_ALMOCO: retornoAlmoco,
      SAIDA_EXPEDIENTE: saidaExpediente,
    });

    const [updated] = await db
      .update(workSchedules)
      .set({
        nome,
        descricao: descricao || null,
        entrada,
        saidaExpediente,
        saidaAlmoco,
        retornoAlmoco,
        cargaDiariaMin: cargaInformada ?? cargaCalculada,
        toleranciaMin: toleranciaMin ?? jornada.toleranciaMin,
        diasSemana,
        ativo,
        updatedAt: new Date(),
      })
      .where(eq(workSchedules.id, id))
      .returning();

    await logAudit({
      actor,
      action: "ATUALIZAR_JORNADA",
      entity: "work_schedules",
      entityId: id,
      details: { nome, entrada, saidaExpediente, diasSemana, ativo },
    });

    return ok({ jornada: updated });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const linked = await db
      .select({ id: employees.id, nome: employees.nome })
      .from(employees)
      .where(eq(employees.jornadaId, id));

    if (linked.length > 0) {
      throw new ApiError(
        `Esta jornada está vinculada a ${linked.length} servidor(es). Desative-a ou altere o vínculo antes de excluir.`,
        409,
      );
    }

    const current = await db
      .select()
      .from(workSchedules)
      .where(eq(workSchedules.id, id))
      .limit(1);
    if (!current[0]) throw new ApiError("Jornada não encontrada.", 404);

    await db.delete(workSchedules).where(eq(workSchedules.id, id));
    await logAudit({
      actor,
      action: "EXCLUIR_JORNADA",
      entity: "work_schedules",
      entityId: id,
      details: { nome: current[0].nome },
    });

    return ok({ sucesso: true });
  });
}
