import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, workSchedules } from "@/db/schema";
import { absenceLabel } from "@/lib/ausencias";
import { loadActiveAbsences, loadHolidayByDate, loadHolidays } from "@/lib/calendar";
import { buildEmployeeWeeks, buildMonthlyReport, type DayReportRow } from "@/lib/reports";
import { dayForDate, dayLabel, isWorkDay, type DaySchedule } from "@/lib/schedule";
import { ENTRY_LABELS, ENTRY_ORDER, monthEnd, nowLocal, type EntryType } from "@/lib/time";

export type StatusConferencia =
  | "COMPLETO"
  | "PARCIAL"
  | "SEM_REGISTRO"
  | "AGUARDANDO"
  | "AUSENCIA"
  | "FERIADO"
  | "SEM_EXPEDIENTE"
  | "EXTRA";

export const STATUS_META: Record<
  StatusConferencia,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" | "brand" }
> = {
  COMPLETO: { label: "Registro total", tone: "success" },
  PARCIAL: { label: "Registro parcial", tone: "warning" },
  SEM_REGISTRO: { label: "Não registrou", tone: "danger" },
  AGUARDANDO: { label: "Aguardando registro", tone: "info" },
  AUSENCIA: { label: "Ausência justificada", tone: "brand" },
  FERIADO: { label: "Feriado / ponto facultativo", tone: "neutral" },
  SEM_EXPEDIENTE: { label: "Sem expediente", tone: "neutral" },
  EXTRA: { label: "Registro em dia sem expediente", tone: "info" },
};

export type BatidaConferencia = { tipo: EntryType; label: string; hora: string | null };

export type ConferenciaDia = {
  employeeId: number;
  nome: string;
  cargo: string;
  matricula: string;
  modeloNome: string | null;
  status: StatusConferencia;
  statusLabel: string;
  batidas: BatidaConferencia[];
  registradas: number;
  previstas: number;
  horarioLabel: string;
  ausencia: string | null;
  feriado: string | null;
  workedMinutes: number;
  expectedMinutes: number;
  saldo: number;
  atraso: boolean;
};

export type ConferenciaMesLinha = {
  employeeId: number;
  nome: string;
  cargo: string;
  matricula: string;
  modeloNome: string | null;
  diasPrevistos: number;
  completos: number;
  parciais: number;
  semRegistro: number;
  aguardando: number;
  ausencias: number;
  feriados: number;
  extras: number;
  atrasos: number;
  totalMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
  diasComProblema: { data: string; status: StatusConferencia; label: string }[];
};

export type ConferenciaResultado = {
  data: string;
  mes: string;
  hoje: string;
  dia: ConferenciaDia[];
  mesLinhas: ConferenciaMesLinha[];
  resumoDia: Record<StatusConferencia, number> & { servidores: number };
  resumoMes: {
    servidores: number;
    diasPrevistos: number;
    completos: number;
    parciais: number;
    semRegistro: number;
    ausencias: number;
    feriados: number;
    extras: number;
    atrasos: number;
    totalMinutos: number;
    esperadoMinutos: number;
    saldoMinutos: number;
  };
};

type ServidorBase = {
  id: number;
  nome: string;
  cargo: string;
  matricula: string;
  jornadaId: number | null;
  modeloNome: string | null;
};

function batidasDoDia(dia: DayReportRow | null, esperadas: EntryType[]): BatidaConferencia[] {
  const tipos = esperadas.length > 0 ? esperadas : ENTRY_ORDER;
  return tipos.map((tipo) => {
    const registro = dia?.entries.find((item) => item.tipo === tipo);
    return { tipo, label: ENTRY_LABELS[tipo], hora: registro?.hora ?? null };
  });
}

/**
 * Conferência de frequência: situação de cada servidor em um dia e no mês
 * (registro total, parcial ou ausência de registro), considerando horário de
 * trabalho, feriados, pontos facultativos e ausências cadastradas.
 */
export async function buildConferencia(mes: string, data: string): Promise<ConferenciaResultado> {
  const hoje = nowLocal().date;
  const inicioMes = `${mes}-01`;
  const fimMes = monthEnd(mes);

  const servidores: ServidorBase[] = await db
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

  const ids = servidores.map((item) => item.id);
  const [report, weeks, holidays, absencesMap] = await Promise.all([
    buildMonthlyReport(mes, ids),
    buildEmployeeWeeks(ids),
    loadHolidays(inicioMes, fimMes),
    loadActiveAbsences(ids, inicioMes, fimMes),
  ]);

  const porServidor = new Map(report.rows.map((row) => [row.employeeId, row]));

  // ---- Situação do dia selecionado -------------------------------------------
  const feriadoDoDia = data >= inicioMes && data <= fimMes ? holidays.get(data) ?? null : null;
  const feriadoExtra = feriadoDoDia ? null : await loadHolidayByDate(data);
  const feriadoSelecionado = feriadoDoDia ?? feriadoExtra;

  const dia: ConferenciaDia[] = servidores.map((servidor) => {
    const week = weeks.get(servidor.id) ?? new Map<number, DaySchedule>();
    const horario = dayForDate(week, data);
    const trabalha = isWorkDay(horario);
    const linha = porServidor.get(servidor.id);
    const diaRelatorio = linha?.dias.find((item) => item.data === data) ?? null;
    const esperadas = diaRelatorio?.esperadas ?? (trabalha ? ENTRY_ORDER : []);
    const ausencias = ausencesParaDia(absencesMap.get(servidor.id) ?? [], data, diaRelatorio);

    const registradas = diaRelatorio?.entries.length ?? 0;
    const previstas = esperadas.length;

    let status: StatusConferencia;
    let ausenciaLabelDia: string | null = null;
    let feriadoNome: string | null = null;

    if (diaRelatorio?.ausenciaDiaInteiro || ausencias.integral) {
      status = "AUSENCIA";
      ausenciaLabelDia = diaRelatorio
        ? (diaRelatorio.ausencias.find((item) => item.diaInteiro)?.label ?? "Ausência")
        : (ausencias.integral?.tipo ?? "Ausência");
    } else if (feriadoSelecionado?.bloqueiaPonto) {
      status = "FERIADO";
      feriadoNome = feriadoSelecionado.nome;
    } else if (!trabalha) {
      status = registradas > 0 ? "EXTRA" : "SEM_EXPEDIENTE";
    } else if (registradas === 0) {
      status = data < hoje ? "SEM_REGISTRO" : data === hoje ? "AGUARDANDO" : "AGUARDANDO";
    } else if (previstas > 0 && registradas >= previstas) {
      status = "COMPLETO";
    } else {
      status = "PARCIAL";
    }

    if (feriadoSelecionado && status !== "FERIADO" && status !== "AUSENCIA") {
      feriadoNome = feriadoSelecionado.nome;
    }

    const previsto = diaRelatorio?.expectedMinutes ?? 0;

    return {
      employeeId: servidor.id,
      nome: servidor.nome,
      cargo: servidor.cargo,
      matricula: servidor.matricula,
      modeloNome: servidor.modeloNome ?? null,
      status,
      statusLabel: STATUS_META[status].label,
      batidas: batidasDoDia(diaRelatorio, esperadas),
      registradas,
      previstas,
      horarioLabel: dayLabel(horario),
      ausencia: ausenciaLabelDia,
      feriado: feriadoNome,
      workedMinutes: diaRelatorio?.workedMinutes ?? 0,
      expectedMinutes: previsto,
      saldo: (diaRelatorio?.workedMinutes ?? 0) - previsto,
      atraso: Boolean(diaRelatorio?.atraso),
    };
  });

  // ---- Consolidado do mês ----------------------------------------------------
  const mesLinhas: ConferenciaMesLinha[] = servidores.map((servidor) => {
    const linha = porServidor.get(servidor.id);
    const dias = (linha?.dias ?? []).filter((item) => item.data <= hoje);
    const statusDias = dias.map((item) => {
      const feriado = holidays.get(item.data);
      let status: StatusConferencia;
      if (item.ausenciaDiaInteiro) status = "AUSENCIA";
      else if (feriado?.bloqueiaPonto) status = "FERIADO";
      else if (!isWorkDay(item.horario)) status = item.entries.length > 0 ? "EXTRA" : "SEM_EXPEDIENTE";
      else if (item.entries.length === 0) status = item.data < hoje ? "SEM_REGISTRO" : "AGUARDANDO";
      else if (item.esperadas.length > 0 && item.entries.length >= item.esperadas.length)
        status = "COMPLETO";
      else status = "PARCIAL";
      return { data: item.data, status, item };
    });

    const contar = (alvo: StatusConferencia) =>
      statusDias.filter((item) => item.status === alvo).length;

    return {
      employeeId: servidor.id,
      nome: servidor.nome,
      cargo: servidor.cargo,
      matricula: servidor.matricula,
      modeloNome: servidor.modeloNome ?? null,
      diasPrevistos: statusDias.filter(
        (item) => item.status !== "SEM_EXPEDIENTE" && item.status !== "FERIADO",
      ).length,
      completos: contar("COMPLETO"),
      parciais: contar("PARCIAL"),
      semRegistro: contar("SEM_REGISTRO"),
      aguardando: contar("AGUARDANDO"),
      ausencias: contar("AUSENCIA"),
      feriados: statusDias.filter((item) => holidays.has(item.data) && item.status !== "AUSENCIA")
        .length,
      extras: contar("EXTRA"),
      atrasos: dias.filter((item) => item.atraso).length,
      totalMinutos: linha?.totalMinutos ?? 0,
      esperadoMinutos: linha?.esperadoMinutos ?? 0,
      saldoMinutos: linha?.saldoMinutos ?? 0,
      diasComProblema: statusDias
        .filter((item) => item.status === "PARCIAL" || item.status === "SEM_REGISTRO")
        .map((item) => ({
          data: item.data,
          status: item.status,
          label: STATUS_META[item.status].label,
        })),
    };
  });

  const resumoDia: Record<StatusConferencia, number> & { servidores: number } = {
    servidores: dia.length,
    COMPLETO: dia.filter((item) => item.status === "COMPLETO").length,
    PARCIAL: dia.filter((item) => item.status === "PARCIAL").length,
    SEM_REGISTRO: dia.filter((item) => item.status === "SEM_REGISTRO").length,
    AGUARDANDO: dia.filter((item) => item.status === "AGUARDANDO").length,
    AUSENCIA: dia.filter((item) => item.status === "AUSENCIA").length,
    FERIADO: dia.filter((item) => item.status === "FERIADO").length,
    SEM_EXPEDIENTE: dia.filter((item) => item.status === "SEM_EXPEDIENTE").length,
    EXTRA: dia.filter((item) => item.status === "EXTRA").length,
  };


  return {
    data,
    mes,
    hoje,
    dia,
    mesLinhas,
    resumoDia,
    resumoMes: {
      servidores: mesLinhas.length,
      diasPrevistos: mesLinhas.reduce((acc, item) => acc + item.diasPrevistos, 0),
      completos: mesLinhas.reduce((acc, item) => acc + item.completos, 0),
      parciais: mesLinhas.reduce((acc, item) => acc + item.parciais, 0),
      semRegistro: mesLinhas.reduce((acc, item) => acc + item.semRegistro, 0),
      ausencias: mesLinhas.reduce((acc, item) => acc + item.ausencias, 0),
      feriados: mesLinhas.reduce((acc, item) => acc + item.feriados, 0),
      extras: mesLinhas.reduce((acc, item) => acc + item.extras, 0),
      atrasos: mesLinhas.reduce((acc, item) => acc + item.atrasos, 0),
      totalMinutos: mesLinhas.reduce((acc, item) => acc + item.totalMinutos, 0),
      esperadoMinutos: mesLinhas.reduce((acc, item) => acc + item.esperadoMinutos, 0),
      saldoMinutos: mesLinhas.reduce((acc, item) => acc + item.saldoMinutos, 0),
    },
  };
}

/** Ausência que cobre o dia conferido (usa o relatório quando disponível). */
function ausencesParaDia(
  lista: { dataInicio: string; dataFim: string; periodo: string; tipo: string }[],
  data: string,
  diaRelatorio: DayReportRow | null,
): { integral: { tipo: string } | null } {
  if (diaRelatorio) {
    const integral = diaRelatorio.ausencias.find((item) => item.diaInteiro);
    return { integral: integral ? { tipo: integral.label } : null };
  }
  const doDia = lista.filter((item) => item.dataInicio <= data && data <= item.dataFim);
  const integral = doDia.find((item) => item.periodo !== "PARCIAL");
  return { integral: integral ? { tipo: absenceLabel(integral.tipo) } : null };
}
