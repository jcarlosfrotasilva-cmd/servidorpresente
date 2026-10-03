import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  absences,
  adjustmentRequests,
  auditLogs,
  employeeSchedules,
  employees,
  holidays,
  timeEntries,
  workSchedules,
} from "@/db/schema";
import { ApiError, handleRoute, ok } from "@/lib/api";
import {
  absencesOnDate,
  expectedMinutesWithAbsences,
  expectedSequenceWithAbsences,
  loadActiveAbsences,
  loadHolidayByDate,
} from "@/lib/calendar";
import { absenceLabel, absencePeriodLabel, isFullDay } from "@/lib/ausencias";
import {
  dayForDate,
  dayIsLate,
  dayLabel,
  isWorkDay,
  type DaySchedule,
} from "@/lib/schedule";
import { getCurrentUser } from "@/lib/session";
import { addDays, computeWorkedMinutes, monthEnd, nowLocal, parseTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const today = nowLocal().date;
    const month = today.slice(0, 7);

    const [servidoresAtivos] = await db
      .select({ total: count() })
      .from(employees)
      .where(eq(employees.ativo, true));

    const [pendentes] = await db
      .select({ total: count() })
      .from(adjustmentRequests)
      .where(eq(adjustmentRequests.status, "PENDENTE"));

    const [registrosHoje] = await db
      .select({ total: count() })
      .from(timeEntries)
      .where(eq(timeEntries.data, today));

    const [registrosMes] = await db
      .select({ total: count() })
      .from(timeEntries)
      .where(and(gte(timeEntries.data, `${month}-01`), lte(timeEntries.data, monthEnd(month))));

    const servidores = await db
    .select({
      id: employees.id,
      nome: employees.nome,
      cargo: employees.cargo,
      matricula: employees.matricula,
      jornadaId: employees.jornadaId,
      modeloNome: workSchedules.nome,
    })
    .from(employees)
    .leftJoin(workSchedules, eq(employees.jornadaId, workSchedules.id))
    .where(eq(employees.ativo, true))
    .orderBy(asc(employees.nome));

  const ids = servidores.map((row) => row.id);
  const [schedules, entriesToday, feriadoHoje, ausenciasMap] = await Promise.all([
    ids.length
      ? db
          .select({
            employeeId: employeeSchedules.employeeId,
            diaSemana: employeeSchedules.diaSemana,
            trabalha: employeeSchedules.trabalha,
            entrada: employeeSchedules.entrada,
            saidaAlmoco: employeeSchedules.saidaAlmoco,
            retornoAlmoco: employeeSchedules.retornoAlmoco,
            saidaExpediente: employeeSchedules.saidaExpediente,
            toleranciaMin: employeeSchedules.toleranciaMin,
          })
          .from(employeeSchedules)
          .where(inArray(employeeSchedules.employeeId, ids))
      : Promise.resolve([]),
    ids.length
      ? db
          .select({
            id: timeEntries.id,
            employeeId: timeEntries.employeeId,
            tipo: timeEntries.tipo,
            hora: timeEntries.hora,
            data: timeEntries.data,
            origin: timeEntries.origin,
          })
          .from(timeEntries)
          .where(and(eq(timeEntries.data, today), inArray(timeEntries.employeeId, ids)))
      : Promise.resolve([]),
    loadHolidayByDate(today),
    loadActiveAbsences(ids, today, today),
  ]);

  const weeks = new Map<number, Map<number, DaySchedule>>();
  for (const row of schedules) {
    const week = weeks.get(row.employeeId) ?? new Map<number, DaySchedule>();
    week.set(row.diaSemana, { ...row, diaSemana: row.diaSemana });
    weeks.set(row.employeeId, week);
  }

  const panel = servidores.map((servidor) => {
    const week = weeks.get(servidor.id) ?? new Map<number, DaySchedule>();
    const horario = dayForDate(week, today);
    const trabalhaHoje = isWorkDay(horario);
    const ausenciasDia = absencesOnDate(ausenciasMap.get(servidor.id), today);
    const ausenciaIntegral = ausenciasDia.find((ausencia) => isFullDay(ausencia)) ?? null;
    const feriadoBloqueia = Boolean(feriadoHoje?.bloqueiaPonto);
    const previsto =
      trabalhaHoje && !feriadoBloqueia && !ausenciaIntegral
        ? expectedMinutesWithAbsences(horario, ausenciasDia)
        : 0;
    const esperadas = expectedSequenceWithAbsences(horario, ausenciasDia);
    const mine = entriesToday.filter((entry) => entry.employeeId === servidor.id);
    const map: Record<string, string> = {};
    mine.forEach((entry) => {
      map[entry.tipo] = entry.hora;
    });
    const worked = computeWorkedMinutes({
      ENTRADA: map.ENTRADA ?? null,
      SAIDA_ALMOCO: map.SAIDA_ALMOCO ?? null,
      RETORNO_ALMOCO: map.RETORNO_ALMOCO ?? null,
      SAIDA_EXPEDIENTE: map.SAIDA_EXPEDIENTE ?? null,
    });
    const status:
      | "EXPEDIENTE"
      | "INTERVALO"
      | "ENCERRADO"
      | "AUSENTE"
      | "FOLGA"
      | "AUSENCIA"
      | "FERIADO" = feriadoBloqueia
      ? "FERIADO"
      : ausenciaIntegral
        ? "AUSENCIA"
        : !trabalhaHoje
      ? mine.length > 0
        ? "ENCERRADO"
        : "FOLGA"
      : map.SAIDA_EXPEDIENTE
        ? "ENCERRADO"
        : map.SAIDA_ALMOCO
          ? "INTERVALO"
          : map.ENTRADA
            ? "EXPEDIENTE"
            : "AUSENTE";
    return {
      id: servidor.id,
      nome: servidor.nome,
      cargo: servidor.cargo,
      matricula: servidor.matricula,
      modeloNome: servidor.modeloNome ?? null,
      horarioHoje: dayLabel(horario),
      trabalhaHoje,
      previsto,
      esperadas,
      feriadoHoje: feriadoHoje
        ? { nome: feriadoHoje.nome, tipo: feriadoHoje.tipo, bloqueiaPonto: feriadoHoje.bloqueiaPonto }
        : null,
      ausenciasHoje: ausenciasDia.map((ausencia) => ({
        tipo: ausencia.tipo,
        label: absenceLabel(ausencia.tipo),
        periodo: String(ausencia.periodo),
        detalhe: absencePeriodLabel(ausencia),
        diaInteiro: isFullDay(ausencia),
      })),
      batidas: mine.length,
      ultima:
        mine.sort((a, b) => (parseTime(b.hora) ?? 0) - (parseTime(a.hora) ?? 0))[0]?.hora ?? null,
      trabalhado: worked,
      atraso: trabalhaHoje && dayIsLate(horario, map.ENTRADA ?? null),
      status,
    };
  });

    const ultimosRegistros = await db
      .select({
        id: timeEntries.id,
        employeeNome: employees.nome,
        tipo: timeEntries.tipo,
        hora: timeEntries.hora,
        data: timeEntries.data,
        origin: timeEntries.origin,
      })
      .from(timeEntries)
      .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
      .orderBy(desc(timeEntries.createdAt))
      .limit(8);

    const solicitacoesRecentes = await db
      .select({
        id: adjustmentRequests.id,
        employeeNome: employees.nome,
        data: adjustmentRequests.data,
        tipo: adjustmentRequests.tipo,
        horaSolicitada: adjustmentRequests.horaSolicitada,
        status: adjustmentRequests.status,
        createdAt: adjustmentRequests.createdAt,
      })
      .from(adjustmentRequests)
      .innerJoin(employees, eq(adjustmentRequests.employeeId, employees.id))
      .orderBy(desc(adjustmentRequests.createdAt))
      .limit(6);

    const serieRows = await db
      .select({
        data: timeEntries.data,
        total: sql<number>`count(*)::int`,
      })
      .from(timeEntries)
      .where(
        and(
          gte(timeEntries.data, addDays(today, -6)),
          lte(timeEntries.data, today),
        ),
      )
      .groupBy(timeEntries.data);

    const serie = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(today, -(6 - index));
      const found = serieRows.find((row) => row.data === date);
      return { data: date, total: Number(found?.total ?? 0) };
    });

    const auditoria = await db
      .select({
        id: auditLogs.id,
        actorNome: auditLogs.actorNome,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(7);

    const proximosFeriados = await db
      .select({
        id: holidays.id,
        data: holidays.data,
        nome: holidays.nome,
        tipo: holidays.tipo,
        bloqueiaPonto: holidays.bloqueiaPonto,
      })
      .from(holidays)
      .where(gte(holidays.data, today))
      .orderBy(asc(holidays.data))
      .limit(5);

    const ausenciasProximas = await db
      .select({
        id: absences.id,
        employeeNome: employees.nome,
        tipo: absences.tipo,
        periodo: absences.periodo,
        dataInicio: absences.dataInicio,
        dataFim: absences.dataFim,
        horaInicio: absences.horaInicio,
        horaFim: absences.horaFim,
      })
      .from(absences)
      .innerJoin(employees, eq(absences.employeeId, employees.id))
      .where(and(eq(absences.status, "ATIVA"), gte(absences.dataFim, today)))
      .orderBy(asc(absences.dataInicio))
      .limit(6);

    return ok({
      hoje: today,
      feriadoHoje: feriadoHoje
        ? {
            nome: feriadoHoje.nome,
            tipo: feriadoHoje.tipo,
            bloqueiaPonto: feriadoHoje.bloqueiaPonto,
          }
        : null,
      proximosFeriados,
      ausenciasProximas: ausenciasProximas.map((row) => ({
        ...row,
        label: absenceLabel(row.tipo),
        detalhe: absencePeriodLabel(row),
      })),
      kpis: {
        servidoresAtivos: Number(servidoresAtivos?.total ?? 0),
        pendentes: Number(pendentes?.total ?? 0),
        registrosHoje: Number(registrosHoje?.total ?? 0),
        registrosMes: Number(registrosMes?.total ?? 0),
        emExpediente: panel.filter((row) => row.status === "EXPEDIENTE").length,
        emIntervalo: panel.filter((row) => row.status === "INTERVALO").length,
        ausentes: panel.filter((row) => row.status === "AUSENTE").length,
        folga: panel.filter((row) => row.status === "FOLGA").length,
        ausencias: panel.filter((row) => row.status === "AUSENCIA").length,
        feriado: panel.filter((row) => row.status === "FERIADO").length,
        atrasos: panel.filter((row) => row.atraso).length,
        encerrados: panel.filter((row) => row.status === "ENCERRADO").length,
        previstoHoje: panel.reduce((acc, row) => acc + row.previsto, 0),
        trabalhadoHoje: panel.reduce((acc, row) => acc + row.trabalhado, 0),
      },
      panel,
      ultimosRegistros,
      solicitacoesRecentes,
      serie,
      auditoria,
    });
  });
}
