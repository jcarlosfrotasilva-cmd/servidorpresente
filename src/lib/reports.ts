import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { employeeSchedules, employees, timeEntries, workSchedules } from "@/db/schema";
import {
  absencesOnDate,
  expectedMinutesWithAbsences,
  expectedSequenceWithAbsences,
  loadActiveAbsences,
  loadHolidays,
  type Holiday,
} from "@/lib/calendar";
import { absenceLabel, isFullDay, type Ausencia } from "@/lib/ausencias";
import {
  dayForDate,
  dayIsLate,
  isWorkDay,
  weekSummary,
  type DaySchedule,
} from "@/lib/schedule";
import {
  computeWorkedMinutes,
  dayOfWeek,
  daysInMonth,
  monthEnd,
  nowLocal,
  parseTime,
  type DayEntryMap,
  type EntryType,
} from "@/lib/time";

export type DayAusencia = {
  tipo: string;
  label: string;
  periodo: string;
  diaInteiro: boolean;
  horaInicio: string | null;
  horaFim: string | null;
};

export type DayReportRow = {
  data: string;
  weekday: number;
  entries: { tipo: EntryType; hora: string; id: number }[];
  esperadas: EntryType[];
  horario: DaySchedule | null;
  feriado: { nome: string; tipo: string; bloqueiaPonto: boolean } | null;
  ausencias: DayAusencia[];
  ausenciaDiaInteiro: boolean;
  diaNaoUtil: boolean;
  /** Dia posterior à data de hoje: lançamento programado (feriado/ausência já cadastrados). */
  futuro: boolean;
  workedMinutes: number;
  expectedMinutes: number;
  saldo: number;
  atraso: boolean;
  incompleto: boolean;
  falta: boolean;
  folga: boolean;
};

export type EmployeeReportRow = {
  employeeId: number;
  nome: string;
  cargo: string;
  matricula: string;
  modeloNome: string | null;
  diasSemana: number[];
  cargaSemanalMin: number;
  diasTrabalhados: number;
  diasFalta: number;
  diasIncompletos: number;
  diasExtra: number;
  diasFeriado: number;
  diasAusencia: number;
  atrasos: number;
  totalMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
  dias: DayReportRow[];
};

export type MonthlyReport = {
  mes: string;
  rows: EmployeeReportRow[];
  totais: {
    servidores: number;
    totalMinutos: number;
    esperadoMinutos: number;
    saldoMinutos: number;
    diasFalta: number;
    atrasos: number;
    diasExtra: number;
    diasFeriado: number;
    diasAusencia: number;
  };
};

export async function buildEmployeeWeeks(
  employeeIds: number[],
): Promise<Map<number, Map<number, DaySchedule>>> {
  const result = new Map<number, Map<number, DaySchedule>>();
  if (employeeIds.length === 0) return result;

  const rows = await db
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
    .where(inArray(employeeSchedules.employeeId, employeeIds));

  for (const row of rows) {
    const week = result.get(row.employeeId) ?? new Map<number, DaySchedule>();
    week.set(row.diaSemana, {
      diaSemana: row.diaSemana,
      trabalha: row.trabalha,
      entrada: row.entrada,
      saidaAlmoco: row.saidaAlmoco,
      retornoAlmoco: row.retornoAlmoco,
      saidaExpediente: row.saidaExpediente,
      toleranciaMin: row.toleranciaMin,
    });
    result.set(row.employeeId, week);
  }

  return result;
}

export async function buildMonthlyReport(
  month: string,
  employeeIds?: number[],
  opcoes?: {
    /** Inclui dias futuros que tenham feriado ou ausência cadastrados (usado no Livro Ponto). */
    incluirFuturos?: boolean;
  },
): Promise<MonthlyReport> {
  const start = `${month}-01`;
  const end = monthEnd(month);

  const filters = [eq(employees.ativo, true)];
  if (employeeIds && employeeIds.length > 0) {
    filters.push(inArray(employees.id, employeeIds));
  }

  const baseRows = await db
    .select({
      id: employees.id,
      nome: employees.nome,
      cargo: employees.cargo,
      matricula: employees.matricula,
      modeloNome: workSchedules.nome,
    })
    .from(employees)
    .leftJoin(workSchedules, eq(employees.jornadaId, workSchedules.id))
    .where(and(...filters))
    .orderBy(asc(employees.nome));

  const empty: MonthlyReport = {
    mes: month,
    rows: [],
    totais: {
      servidores: 0,
      totalMinutos: 0,
      esperadoMinutos: 0,
      saldoMinutos: 0,
      diasFalta: 0,
      atrasos: 0,
      diasExtra: 0,
      diasFeriado: 0,
      diasAusencia: 0,
    },
  };
  if (baseRows.length === 0) return empty;

  const ids = baseRows.map((row) => row.id);
  const [weeks, entries, holidays, absencesMap] = await Promise.all([
    buildEmployeeWeeks(ids),
    db
      .select({
        id: timeEntries.id,
        employeeId: timeEntries.employeeId,
        data: timeEntries.data,
        tipo: timeEntries.tipo,
        hora: timeEntries.hora,
      })
      .from(timeEntries)
      .where(
        and(gte(timeEntries.data, start), lte(timeEntries.data, end), inArray(timeEntries.employeeId, ids)),
      ),
    loadHolidays(start, end).catch((error) => {
      console.error("[reports] falha ao carregar feriados:", error);
      return new Map<string, Holiday>();
    }),
    loadActiveAbsences(ids, start, end).catch((error) => {
      console.error("[reports] falha ao carregar ausências:", error);
      return new Map<number, Ausencia[]>();
    }),
  ]);

  const byEmployee = new Map<number, typeof entries>();
  for (const entry of entries) {
    const list = byEmployee.get(entry.employeeId);
    if (list) list.push(entry);
    else byEmployee.set(entry.employeeId, [entry]);
  }

  const today = nowLocal().date;
  const todayMonth = today.slice(0, 7);
  // Meses futuros não têm dias apuráveis (evita "faltas" em datas que ainda vão ocorrer).
  const limitDate =
    opcoes?.incluirFuturos && month === todayMonth
      ? monthEnd(month)
      : month === todayMonth
        ? today
        : month < todayMonth
          ? monthEnd(month)
          : "";
  const allDays = daysInMonth(month);

  const report: EmployeeReportRow[] = baseRows.map((row) => {
    const week = weeks.get(row.id) ?? new Map<number, DaySchedule>();
    const resumo = weekSummary(week);
    const employeeEntries = byEmployee.get(row.id) ?? [];
    const grouped = new Map<string, typeof employeeEntries>();
    for (const entry of employeeEntries) {
      const list = grouped.get(entry.data);
      if (list) list.push(entry);
      else grouped.set(entry.data, [entry]);
    }

    const dias: DayReportRow[] = [];
    const ausenciasServidor = absencesMap.get(row.id) ?? [];

    for (const dia of allDays) {
      if (dia > limitDate) break;
      const horario = dayForDate(week, dia);
      const agendado = isWorkDay(horario);
      const feriado: Holiday | null = holidays.get(dia) ?? null;
      const feriadoBloqueia = Boolean(feriado?.bloqueiaPonto);
      const ausenciasDia = absencesOnDate(ausenciasServidor, dia);
      const temAusenciaIntegral = ausenciasDia.some((ausencia) => isFullDay(ausencia));
      const dayEntries = (grouped.get(dia) ?? []).sort(
        (a, b) => (parseTime(a.hora) ?? 0) - (parseTime(b.hora) ?? 0),
      );
      const futuro = dia > today;
      if (!agendado && dayEntries.length === 0 && !feriado && ausenciasDia.length === 0) continue;
      // Dias futuros comuns não são apurados: só constam quando há feriado ou ausência cadastrados.
      if (futuro && !feriado && ausenciasDia.length === 0) continue;

      const map: DayEntryMap = {};
      for (const entry of dayEntries) map[entry.tipo] = entry.hora;
      const worked = computeWorkedMinutes(map);
      const esperadas = expectedSequenceWithAbsences(horario, ausenciasDia);
      const registrados = dayEntries.map((entry) => entry.tipo);
      const faltantes = esperadas.filter((tipo) => !registrados.includes(tipo));
      const esperadoBruto = agendado ? expectedMinutesWithAbsences(horario, ausenciasDia) : 0;
      const expected = feriadoBloqueia || temAusenciaIntegral || futuro ? 0 : esperadoBruto;
      const diaNaoUtil = !agendado || feriadoBloqueia || temAusenciaIntegral;

      dias.push({
        data: dia,
        weekday: dayOfWeek(dia),
        entries: dayEntries.map((entry) => ({
          tipo: entry.tipo,
          hora: entry.hora.slice(0, 5),
          id: entry.id,
        })),
        esperadas,
        horario: horario
          ? {
              ...horario,
              entrada: horario.entrada?.slice(0, 5) ?? null,
              saidaAlmoco: horario.saidaAlmoco?.slice(0, 5) ?? null,
              retornoAlmoco: horario.retornoAlmoco?.slice(0, 5) ?? null,
              saidaExpediente: horario.saidaExpediente?.slice(0, 5) ?? null,
            }
          : null,
        feriado: feriado
          ? { nome: feriado.nome, tipo: feriado.tipo, bloqueiaPonto: feriado.bloqueiaPonto }
          : null,
        ausencias: ausenciasDia.map((ausencia) => ({
          tipo: ausencia.tipo,
          label: absenceLabel(ausencia.tipo),
          periodo: String(ausencia.periodo),
          diaInteiro: isFullDay(ausencia),
          horaInicio: ausencia.horaInicio?.slice(0, 5) ?? null,
          horaFim: ausencia.horaFim?.slice(0, 5) ?? null,
        })),
        ausenciaDiaInteiro: temAusenciaIntegral,
        diaNaoUtil,
        futuro,
        workedMinutes: worked,
        expectedMinutes: expected,
        saldo: diaNaoUtil ? worked : worked - expected,
        atraso:
          !futuro &&
          agendado &&
          !feriadoBloqueia &&
          !temAusenciaIntegral &&
          dayIsLate(horario, map.ENTRADA),
        incompleto:
          !futuro &&
          agendado &&
          !feriadoBloqueia &&
          !temAusenciaIntegral &&
          dayEntries.length > 0 &&
          faltantes.length > 0 &&
          dia < today,
        falta:
          !futuro &&
          agendado &&
          !feriadoBloqueia &&
          !temAusenciaIntegral &&
          dayEntries.length === 0,
        folga: !agendado,
      });
    }

    const totalMinutos = dias.reduce((acc, dia) => acc + dia.workedMinutes, 0);
    const esperadoMinutos = dias.reduce((acc, dia) => acc + dia.expectedMinutes, 0);

    return {
      employeeId: row.id,
      nome: row.nome,
      cargo: row.cargo,
      matricula: row.matricula,
      modeloNome: row.modeloNome ?? null,
      diasSemana: resumo.diasUteis,
      cargaSemanalMin: resumo.minutos,
      diasTrabalhados: dias.filter((dia) => dia.workedMinutes > 0).length,
      diasFalta: dias.filter((dia) => dia.falta).length,
      diasIncompletos: dias.filter((dia) => dia.incompleto).length,
      diasExtra: dias.filter((dia) => dia.diaNaoUtil && dia.entries.length > 0 && !dia.ausenciaDiaInteiro)
        .length,
      diasFeriado: dias.filter((dia) => dia.feriado?.bloqueiaPonto).length,
      diasAusencia: dias.filter((dia) => dia.ausenciaDiaInteiro).length,
      atrasos: dias.filter((dia) => dia.atraso).length,
      totalMinutos,
      esperadoMinutos,
      saldoMinutos: totalMinutos - esperadoMinutos,
      dias,
    };
  });

  return {
    mes: month,
    rows: report,
    totais: {
      servidores: report.length,
      totalMinutos: report.reduce((acc, row) => acc + row.totalMinutos, 0),
      esperadoMinutos: report.reduce((acc, row) => acc + row.esperadoMinutos, 0),
      saldoMinutos: report.reduce((acc, row) => acc + row.saldoMinutos, 0),
      diasFalta: report.reduce((acc, row) => acc + row.diasFalta, 0),
      atrasos: report.reduce((acc, row) => acc + row.atrasos, 0),
      diasExtra: report.reduce((acc, row) => acc + row.diasExtra, 0),
      diasFeriado: report.reduce((acc, row) => acc + row.diasFeriado, 0),
      diasAusencia: report.reduce((acc, row) => acc + row.diasAusencia, 0),
    },
  };
}
