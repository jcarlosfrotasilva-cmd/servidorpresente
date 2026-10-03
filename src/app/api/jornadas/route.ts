import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, workSchedules } from "@/db/schema";
import {
  ApiError,
  handleRoute,
  ok,
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

export async function GET() {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);

    const rows = await db
      .select({
        id: workSchedules.id,
        nome: workSchedules.nome,
        descricao: workSchedules.descricao,
        entrada: workSchedules.entrada,
        saidaAlmoco: workSchedules.saidaAlmoco,
        retornoAlmoco: workSchedules.retornoAlmoco,
        saidaExpediente: workSchedules.saidaExpediente,
        cargaDiariaMin: workSchedules.cargaDiariaMin,
        toleranciaMin: workSchedules.toleranciaMin,
        diasSemana: workSchedules.diasSemana,
        ativo: workSchedules.ativo,
        servidores: sql<number>`(select count(*)::int from ${employees} where ${employees.jornadaId} = ${workSchedules.id})`,
      })
      .from(workSchedules)
      .orderBy(asc(workSchedules.nome));

    return ok({ jornadas: rows });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const body = await readJson(request);
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
    const ativo = reqBool(body, "ativo", true);

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

    const cargaDiariaMin = computeWorkedMinutes({
      ENTRADA: entrada,
      SAIDA_ALMOCO: saidaAlmoco,
      RETORNO_ALMOCO: retornoAlmoco,
      SAIDA_EXPEDIENTE: saidaExpediente,
    });

    const cargaInformada = reqInt(body, "cargaDiariaMin", "a carga diária", {
      required: false,
      min: 30,
      max: 720,
    });

    const [created] = await db
      .insert(workSchedules)
      .values({
        nome,
        descricao: descricao || null,
        entrada,
        saidaExpediente,
        saidaAlmoco,
        retornoAlmoco,
        cargaDiariaMin: cargaInformada ?? cargaDiariaMin,
        toleranciaMin: toleranciaMin ?? 10,
        diasSemana,
        ativo,
      })
      .returning();

    await logAudit({
      actor,
      action: "CRIAR_JORNADA",
      entity: "work_schedules",
      entityId: created.id,
      details: { nome, entrada, saidaExpediente, diasSemana },
    });

    return ok({ jornada: created }, 201);
  });
}


