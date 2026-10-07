import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { absences, employees, holidays } from "@/db/schema";
import {
  absenceLabel,
  absencePeriodLabel,
  coveringAbsence,
  isFullDay,
  toMinutes,
  type Ausencia,
  type AusenciaTipo,
} from "@/lib/ausencias";
import { dayExpectedMinutes, expectedSequence, isWorkDay, type DaySchedule } from "@/lib/schedule";
import { nowLocal, parseTime, type EntryType } from "@/lib/time";

export type Holiday = {
  id: number;
  data: string;
  nome: string;
  tipo: string;
  bloqueiaPonto: boolean;
  descricao: string | null;
};

export async function loadHolidays(start: string, end: string): Promise<Map<string, Holiday>> {
  const rows = await db
    .select({
      id: holidays.id,
      data: holidays.data,
      nome: holidays.nome,
      tipo: holidays.tipo,
      bloqueiaPonto: holidays.bloqueiaPonto,
      descricao: holidays.descricao,
    })
    .from(holidays)
    .where(and(gte(holidays.data, start), lte(holidays.data, end)))
    .orderBy(asc(holidays.data));

  const map = new Map<string, Holiday>();
  rows.forEach((row) => map.set(row.data, row));
  return map;
}

export async function loadHolidayByDate(data: string): Promise<Holiday | null> {
  const rows = await db.select().from(holidays).where(eq(holidays.data, data)).limit(1);
  return rows[0] ?? null;
}

export async function loadActiveAbsences(
  employeeIds: number[],
  start: string,
  end: string,
): Promise<Map<number, Ausencia[]>> {
  const map = new Map<number, Ausencia[]>();
  if (employeeIds.length === 0) return map;

  const rows = await db
    .select({
      id: absences.id,
      employeeId: absences.employeeId,
      employeeNome: employees.nome,
      tipo: absences.tipo,
      periodo: absences.periodo,
      dataInicio: absences.dataInicio,
      dataFim: absences.dataFim,
      horaInicio: absences.horaInicio,
      horaFim: absences.horaFim,
      motivo: absences.motivo,
      documento: absences.documento,
      status: absences.status,
    })
    .from(absences)
    .innerJoin(employees, eq(absences.employeeId, employees.id))
    .where(
      and(
        eq(absences.status, "ATIVA"),
        inArray(absences.employeeId, employeeIds),
        lte(absences.dataInicio, end),
        gte(absences.dataFim, start),
      ),
    )
    .orderBy(desc(absences.dataInicio));

  for (const row of rows) {
    const list = map.get(row.employeeId) ?? [];
    list.push({
      ...row,
      tipo: row.tipo as AusenciaTipo,
      periodo: row.periodo,
      horaInicio: row.horaInicio,
      horaFim: row.horaFim,
    });
    map.set(row.employeeId, list);
  }
  return map;
}

/** Ausências que abrangem a data informada. */
export function absencesOnDate(list: Ausencia[] | undefined, data: string): Ausencia[] {
  if (!list) return [];
  return list.filter((ausencia) => ausencia.dataInicio <= data && data <= ausencia.dataFim);
}

export function fullDayAbsence(list: Ausencia[]): Ausencia | null {
  return list.find((ausencia) => isFullDay(ausencia)) ?? null;
}

export function absenceText(ausencia: Ausencia): string {
  const tipo = absenceLabel(ausencia.tipo);
  const periodo =
    ausencia.dataInicio === ausencia.dataFim
      ? ""
      : ` (${ausencia.dataInicio.slice(8, 10)}/${ausencia.dataInicio.slice(5, 7)} a ${ausencia.dataFim
          .slice(8, 10)
          .padStart(2, "0")}/${ausencia.dataFim.slice(5, 7)})`;
  return `${tipo}${periodo} · ${absencePeriodLabel(ausencia)}`;
}

export type BlockInfo = {
  tipo: "FERIADO" | "PONTO_FACULTATIVO" | "RECESSO" | "SUSPENSAO" | "AUSENCIA";
  titulo: string;
  descricao: string;
};

export function buildBlockInfo(params: {
  holiday: Holiday | null;
  absences: Ausencia[];
  minutes: number;
}): BlockInfo | null {
  const { holiday, absences, minutes } = params;
  if (holiday?.bloqueiaPonto) {
    return {
      tipo: holiday.tipo as BlockInfo["tipo"],
      titulo: holiday.nome,
      descricao:
        holiday.tipo === "PONTO_FACULTATIVO"
          ? "Ponto facultativo: o registro de ponto está bloqueado nesta data conforme calendário escolar."
          : "Data bloqueada para registro de ponto conforme calendário escolar.",
    };
  }
  const inteira = fullDayAbsence(absences);
  if (inteira) {
    return {
      tipo: "AUSENCIA",
      titulo: absenceLabel(inteira.tipo),
      descricao: `Ausência registrada pela direção (${absencePeriodLabel(inteira)}) de ${inteira.dataInicio
        .split("-")
        .reverse()
        .join("/")} a ${inteira.dataFim.split("-").reverse().join("/")}. O registro de ponto está indisponível neste período.`,
    };
  }
  const parcial = coveringAbsence(absences, minutes);
  if (parcial) {
    return {
      tipo: "AUSENCIA",
      titulo: absenceLabel(parcial.tipo),
      descricao: `Ausência parcial registrada das ${parcial.horaInicio?.slice(0, 5)} às ${parcial.horaFim?.slice(
        0,
        5,
      )}. O registro de ponto ficará liberado após o término do intervalo.`,
    };
  }
  return null;
}

/** Sequência de batidas ignorando as que caem dentro de uma ausência. */
export function expectedSequenceWithAbsences(
  day: DaySchedule | null | undefined,
  absences: Ausencia[],
): EntryType[] {
  const base = expectedSequence(day);
  // Em dias sem expediente não há horário de referência para comparar com a ausência parcial.
  if (absences.length === 0 || !day || !isWorkDay(day)) return base;

  const anchors: Record<EntryType, string | null | undefined> = {
    ENTRADA: day.entrada,
    SAIDA_ALMOCO: day.saidaAlmoco,
    RETORNO_ALMOCO: day.retornoAlmoco,
    SAIDA_EXPEDIENTE: day.saidaExpediente,
  };

  return base.filter((tipo) => {
    const minutes = parseTime(anchors[tipo] ?? null);
    if (minutes == null) return false;
    return !absences.some((ausencia) => coveringAbsence([ausencia], minutes) !== null);
  });
}

/** Horas previstas no dia descontando a fração coberta por ausências parciais. */
export function expectedMinutesWithAbsences(
  day: DaySchedule | null | undefined,
  absences: Ausencia[],
): number {
  const base = dayExpectedMinutes(day);
  if (!isWorkDay(day) || absences.length === 0 || !day) return base;

  const inicio = toMinutes(day.entrada);
  const fim = toMinutes(day.saidaExpediente);
  if (inicio == null || fim == null) return 0;

  const segments: [number, number][] = [];
  const saidaAlmoco = toMinutes(day.saidaAlmoco);
  const retornoAlmoco = toMinutes(day.retornoAlmoco);
  if (saidaAlmoco != null && retornoAlmoco != null && retornoAlmoco > saidaAlmoco) {
    segments.push([inicio, saidaAlmoco], [retornoAlmoco, fim]);
  } else {
    segments.push([inicio, fim]);
  }

  let reduzido = 0;
  for (const ausencia of absences) {
    if (isFullDay(ausencia)) return 0;
    const a = toMinutes(ausencia.horaInicio);
    const b = toMinutes(ausencia.horaFim);
    if (a == null || b == null || b <= a) continue;
    for (const [segInicio, segFim] of segments) {
      const from = Math.max(segInicio, a);
      const to = Math.min(segFim, b);
      if (to > from) reduzido += to - from;
    }
  }
  return Math.max(0, base - reduzido);
}

export function nowMinutes(): number {
  return nowLocal().minutes;
}
