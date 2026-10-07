import { ApiError } from "@/lib/api";
import {
  ENTRY_ORDER,
  computeWorkedMinutes,
  dayOfWeek,
  isLate,
  minutesToTime,
  parseTime,
  type EntryType,
} from "@/lib/time";

/** Horário de trabalho individual do servidor em um dia da semana. */
export type DaySchedule = {
  diaSemana: number;
  trabalha: boolean;
  entrada: string | null;
  saidaAlmoco: string | null;
  retornoAlmoco: string | null;
  saidaExpediente: string | null;
  toleranciaMin: number;
};

export type WeekMap = Map<number, DaySchedule>;

export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7];

export function emptyDay(diaSemana: number): DaySchedule {
  return {
    diaSemana,
    trabalha: false,
    entrada: null,
    saidaAlmoco: null,
    retornoAlmoco: null,
    saidaExpediente: null,
    toleranciaMin: 10,
  };
}

export function normalizeDay(input: Partial<DaySchedule> & { diaSemana: number }): DaySchedule {
  return {
    diaSemana: input.diaSemana,
    trabalha: Boolean(input.trabalha),
    entrada: input.entrada ?? null,
    saidaAlmoco: input.saidaAlmoco ?? null,
    retornoAlmoco: input.retornoAlmoco ?? null,
    saidaExpediente: input.saidaExpediente ?? null,
    toleranciaMin: input.toleranciaMin ?? 10,
  };
}

export function buildWeek(rows: DaySchedule[]): WeekMap {
  const map: WeekMap = new Map<number, DaySchedule>();
  WEEK_DAYS.forEach((dia) => map.set(dia, emptyDay(dia)));
  rows.forEach((row) => map.set(row.diaSemana, normalizeDay(row)));
  return map;
}

export function weekToList(week: WeekMap): DaySchedule[] {
  return WEEK_DAYS.map((dia) => week.get(dia) ?? emptyDay(dia));
}

export function getDay(week: WeekMap, diaSemana: number): DaySchedule | null {
  return week.get(diaSemana) ?? null;
}

export function dayForDate(week: WeekMap, dateISO: string): DaySchedule | null {
  return week.get(dayOfWeek(dateISO)) ?? null;
}

export function isWorkDay(day?: DaySchedule | null): boolean {
  return Boolean(day && day.trabalha && day.entrada && day.saidaExpediente);
}

/** Sequência obrigatória de batidas conforme o horário do dia. */
export function expectedSequence(day?: DaySchedule | null): EntryType[] {
  if (!isWorkDay(day)) return ["ENTRADA", "SAIDA_EXPEDIENTE"];
  if (day?.saidaAlmoco && day?.retornoAlmoco) return [...ENTRY_ORDER];
  return ["ENTRADA", "SAIDA_EXPEDIENTE"];
}

export function dayExpectedMinutes(day?: DaySchedule | null): number {
  if (!isWorkDay(day) || !day) return 0;
  return computeWorkedMinutes({
    ENTRADA: day.entrada,
    SAIDA_ALMOCO: day.saidaAlmoco,
    RETORNO_ALMOCO: day.retornoAlmoco,
    SAIDA_EXPEDIENTE: day.saidaExpediente,
  });
}

export function dayIntervalMinutes(day?: DaySchedule | null): number {
  if (!day?.saidaAlmoco || !day?.retornoAlmoco) return 0;
  const inicio = parseTime(day.saidaAlmoco);
  const fim = parseTime(day.retornoAlmoco);
  if (inicio == null || fim == null || fim <= inicio) return 0;
  return fim - inicio;
}

export function weekdayName(diaSemana: number): string {
  const nomes = [
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
  ];
  return nomes[diaSemana - 1] ?? "dia";
}

export function hhmm(value?: string | null): string {
  return value ? value.slice(0, 5) : "";
}

/** "07:00–11:30 / 13:00–17:30" ou "Sem expediente". */
export function dayLabel(day?: DaySchedule | null): string {
  if (!isWorkDay(day) || !day) return "Sem expediente";
  const inicio = `${hhmm(day.entrada)}–${hhmm(day.saidaExpediente)}`;
  if (day.saidaAlmoco && day.retornoAlmoco) {
    return `${hhmm(day.entrada)}–${hhmm(day.saidaAlmoco)} / ${hhmm(day.retornoAlmoco)}–${hhmm(
      day.saidaExpediente,
    )}`;
  }
  return inicio;
}

export function weekSummary(week: WeekMap): { dias: number; minutos: number; diasUteis: number[] } {
  let dias = 0;
  let minutos = 0;
  const diasUteis: number[] = [];
  WEEK_DAYS.forEach((dia) => {
    const day = week.get(dia);
    if (isWorkDay(day)) {
      dias += 1;
      minutos += dayExpectedMinutes(day);
      diasUteis.push(dia);
    }
  });
  return { dias, minutos, diasUteis };
}

export function dayIsLate(day: DaySchedule | null | undefined, entrada?: string | null): boolean {
  return isLate(entrada ?? null, day?.entrada ?? null, day?.toleranciaMin ?? 10);
}

export type PunchMargins = {
  margemAntesMin: number;
  margemDepoisMin: number;
};

export type PunchWindow = {
  abre: number;
  fecha: number;
  abreLabel: string;
  fechaLabel: string;
};

/** Janela liberada para registrar ponto no dia: (entrada − margem) até (saída + margem). */
export function punchWindow(
  day: DaySchedule | null | undefined,
  margens: PunchMargins,
): PunchWindow | null {
  if (!isWorkDay(day) || !day) return null;
  const inicio = parseTime(day.entrada);
  const fim = parseTime(day.saidaExpediente);
  if (inicio == null || fim == null) return null;
  const abre = Math.max(0, inicio - Math.max(0, margens.margemAntesMin));
  const fecha = Math.min(24 * 60, fim + Math.max(0, margens.margemDepoisMin));
  return {
    abre,
    fecha,
    abreLabel: minutesToTime(abre),
    fechaLabel: fecha >= 24 * 60 ? "24:00" : minutesToTime(fecha),
  };
}

export function isWithinPunchWindow(
  minutes: number,
  day: DaySchedule | null | undefined,
  margens: PunchMargins,
): boolean {
  const janela = punchWindow(day, margens);
  if (!janela) return false;
  return minutes >= janela.abre && minutes <= Math.min(janela.fecha, 24 * 60 - 1);
}

export function nextExpectedType(
  sequence: EntryType[],
  registered: EntryType[],
): EntryType | null {
  return sequence.find((tipo) => !registered.includes(tipo)) ?? null;
}

function toTime(value: unknown, label: string, required: boolean): string | null {
  if (value == null || value === "") {
    if (required) throw new ApiError(`Informe ${label}.`);
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value).trim());
  if (!match) throw new ApiError(`${label} deve estar no formato HH:MM.`);
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  const segundos = match[3] ? Number(match[3]) : 0;
  if (horas > 23 || minutos > 59 || segundos > 59) throw new ApiError(`${label} inválido.`);
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:00`;
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  return value === "true" || value === "1" || value === 1;
}

/** Valida e normaliza o quadro semanal enviado pelo gestor. */
export function parseWeekPayload(raw: unknown, toleranceFallback = 10): DaySchedule[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError("Informe o horário de trabalho do servidor para cada dia da semana.");
  }

  const labels = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];

  return raw.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiError("Dia da semana inválido no quadro de horários.");
    }
    const body = item as Record<string, unknown>;
    const diaSemana = Number(body.diaSemana);
    if (!Number.isInteger(diaSemana) || diaSemana < 1 || diaSemana > 7) {
      throw new ApiError("Dia da semana inválido no quadro de horários.");
    }
    const nome = labels[diaSemana - 1];
    const trabalha = toBool(body.trabalha, false);
    const tolerancia = body.toleranciaMin == null ? toleranceFallback : Number(body.toleranciaMin);
    if (!Number.isFinite(tolerancia) || tolerancia < 0 || tolerancia > 120) {
      throw new ApiError(`Tolerância inválida em ${nome} (0 a 120 minutos).`);
    }

    const entrada = toTime(body.entrada, `o horário de entrada de ${nome}`, trabalha);
    const saidaExpediente = toTime(
      body.saidaExpediente,
      `o horário de saída de ${nome}`,
      trabalha,
    );
    const saidaAlmoco = toTime(body.saidaAlmoco, `a saída para o almoço de ${nome}`, false);
    const retornoAlmoco = toTime(body.retornoAlmoco, `o retorno do almoço de ${nome}`, false);

    if ((saidaAlmoco && !retornoAlmoco) || (!saidaAlmoco && retornoAlmoco)) {
      throw new ApiError(
        `Em ${nome}, informe a saída e o retorno do almoço ou deixe os dois campos vazios.`,
      );
    }
    if (trabalha && entrada && saidaExpediente) {
      const inicio = parseTime(entrada);
      const fim = parseTime(saidaExpediente);
      if (inicio != null && fim != null && fim <= inicio) {
        throw new ApiError(`Em ${nome}, o horário de saída deve ser posterior ao de entrada.`);
      }
      const pausaInicio = parseTime(saidaAlmoco);
      const pausaFim = parseTime(retornoAlmoco);
      if (pausaInicio != null && pausaFim != null) {
        if (pausaFim <= pausaInicio) {
          throw new ApiError(`Em ${nome}, o retorno do almoço deve ser posterior à saída.`);
        }
        if (
          inicio != null &&
          fim != null &&
          (pausaInicio <= inicio || pausaFim >= fim)
        ) {
          throw new ApiError(
            `Em ${nome}, o intervalo de almoço deve estar dentro do expediente.`,
          );
        }
      }
    }

    return {
      diaSemana,
      trabalha,
      entrada,
      saidaAlmoco,
      retornoAlmoco,
      saidaExpediente,
      toleranciaMin: Math.round(tolerancia),
    } satisfies DaySchedule;
  });
}
