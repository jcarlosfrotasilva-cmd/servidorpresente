import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { employeeSchedules, employees, timeEntries } from "@/db/schema";
import { ApiError, handleRoute, ok, readJson, reqEnum } from "@/lib/api";
import {
  absencesOnDate,
  buildBlockInfo,
  expectedSequenceWithAbsences,
  loadActiveAbsences,
  loadHolidayByDate,
} from "@/lib/calendar";
import {
  isWorkDay,
  nextExpectedType,
  punchWindow,
  weekdayName,
  type DaySchedule,
} from "@/lib/schedule";
import { getConfiguracao } from "@/lib/config";
import { getCurrentUser, logAudit } from "@/lib/session";
import { ENTRY_LABELS, ENTRY_ORDER, dayOfWeek, minutesToTime, nowLocal } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada. Entre novamente.", 401);
    if (!actor.employeeId) {
      throw new ApiError("Este usuário não está vinculado a um cadastro de servidor.", 400);
    }

    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
    const tipoSolicitado = reqEnum(body, "tipo", "o tipo de marcação", ENTRY_ORDER, {
      required: false,
    });

    const servidor = await db
      .select({ id: employees.id, nome: employees.nome, ativo: employees.ativo })
      .from(employees)
      .where(eq(employees.id, actor.employeeId))
      .limit(1);
    if (!servidor[0]) throw new ApiError("Cadastro de servidor não encontrado.", 404);
    if (!servidor[0].ativo) {
      throw new ApiError("Cadastro inativo. Procure a direção da escola.", 403);
    }

    const now = nowLocal();
    const diaSemana = dayOfWeek(now.date);

    const [scheduleRow] = await db
      .select({
        diaSemana: employeeSchedules.diaSemana,
        trabalha: employeeSchedules.trabalha,
        entrada: employeeSchedules.entrada,
        saidaAlmoco: employeeSchedules.saidaAlmoco,
        retornoAlmoco: employeeSchedules.retornoAlmoco,
        saidaExpediente: employeeSchedules.saidaExpediente,
        toleranciaMin: employeeSchedules.toleranciaMin,
      })
      .from(employeeSchedules)
      .where(
        and(
          eq(employeeSchedules.employeeId, actor.employeeId),
          eq(employeeSchedules.diaSemana, diaSemana),
        ),
      )
      .limit(1);

    const horario: DaySchedule | null = scheduleRow ?? null;
    const config = await getConfiguracao();

    // 1) O dia precisa ter expediente cadastrado no horário individual do servidor.
    if (!isWorkDay(horario)) {
      throw new ApiError(
        `Hoje é ${weekdayName(diaSemana).toLowerCase()} e não há expediente cadastrado no seu horário de trabalho. O registro de ponto só é liberado nos dias e horários definidos pela direção da escola.`,
        409,
      );
    }

    // 2) O horário atual precisa estar dentro da janela liberada (entrada − margem até saída + margem).
    const janela = punchWindow(horario, config);
    if (janela && config.bloquearForaDoHorario) {
      if (now.minutes < janela.abre) {
        throw new ApiError(
          `Fora do horário permitido: o registro de ponto para ${weekdayName(diaSemana).toLowerCase()} é liberado das ${janela.abreLabel} às ${janela.fechaLabel}. Aguarde o início da janela.`,
          409,
        );
      }
      if (now.minutes > janela.fecha) {
        throw new ApiError(
          `Fora do horário permitido: a janela de registro de ${weekdayName(diaSemana).toLowerCase()} encerrou às ${janela.fechaLabel}. Procure a direção da escola para lançar a ocorrência.`,
          409,
        );
      }
    }

    // Feriados / pontos facultativos e ausências (totais ou parciais) bloqueiam o registro.
    const [feriado, ausenciasMap] = await Promise.all([
      loadHolidayByDate(now.date),
      loadActiveAbsences([actor.employeeId], now.date, now.date),
    ]);
    const ausenciasDia = absencesOnDate(ausenciasMap.get(actor.employeeId), now.date);

    const bloqueio = buildBlockInfo({ holiday: feriado, absences: ausenciasDia, minutes: now.minutes });
    if (bloqueio) {
      throw new ApiError(
        `${bloqueio.titulo}: ${bloqueio.descricao}`,
        409,
      );
    }

    const sequencia = expectedSequenceWithAbsences(horario, ausenciasDia);

    const doDia = await db
      .select({ id: timeEntries.id, tipo: timeEntries.tipo, hora: timeEntries.hora })
      .from(timeEntries)
      .where(
        and(eq(timeEntries.employeeId, actor.employeeId), eq(timeEntries.data, now.date)),
      );

    const registrados = doDia.map((row) => row.tipo);
    const esperada = nextExpectedType(sequencia, registrados);
    const tipo = tipoSolicitado ?? esperada;

    if (!tipo || sequencia.length === 0) {
      throw new ApiError(
        sequencia.length === 0 && ausenciasDia.length > 0
          ? "As batidas previstas para hoje estão dentro da ausência registrada. Procure a direção da escola."
          : "Todas as batidas previstas para hoje já foram registradas.",
        409,
      );
    }

    if (registrados.includes(tipo)) {
      throw new ApiError(
        `${ENTRY_LABELS[tipo]} já foi registrada hoje. Caso o horário esteja incorreto, solicite uma retificação.`,
        409,
      );
    }

    if (!esperada || tipo !== esperada) {
      throw new ApiError(
        esperada
          ? `Sequência de marcações: a próxima batida esperada é "${ENTRY_LABELS[esperada]}". Para corrigir horários anteriores utilize a solicitação de retificação.`
          : "Todas as batidas previstas já foram registradas.",
        422,
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;

    const [created] = await db
      .insert(timeEntries)
      .values({
        employeeId: actor.employeeId,
        data: now.date,
        tipo,
        hora: now.time,
        origin: "SERVIDOR",
        ip,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      })
      .returning();

    await logAudit({
      actor,
      action: "REGISTRAR_PONTO",
      entity: "time_entries",
      entityId: created.id,
      details: { tipo, hora: created.hora, data: created.data },
    });

    const after = await db
      .select({ id: timeEntries.id, tipo: timeEntries.tipo, hora: timeEntries.hora })
      .from(timeEntries)
      .where(
        and(eq(timeEntries.employeeId, actor.employeeId), eq(timeEntries.data, now.date)),
      );

    return ok(
      {
        registro: created,
        registrosDoDia: after,
        janela: janela ? { abre: janela.abreLabel, fecha: janela.fechaLabel } : null,
        esperadas: sequencia,
        proximaEsperada: nextExpectedType(sequencia, after.map((row) => row.tipo)),
        mensagem: `${ENTRY_LABELS[tipo]} registrada às ${created.hora.slice(0, 5)}.`,
      },
      201,
    );
  });
}
