export const TZ = "America/Sao_Paulo";

export type EntryType =
  | "ENTRADA"
  | "SAIDA_ALMOCO"
  | "RETORNO_ALMOCO"
  | "SAIDA_EXPEDIENTE";

export const ENTRY_ORDER: EntryType[] = [
  "ENTRADA",
  "SAIDA_ALMOCO",
  "RETORNO_ALMOCO",
  "SAIDA_EXPEDIENTE",
];

export const ENTRY_LABELS: Record<EntryType, string> = {
  ENTRADA: "Entrada",
  SAIDA_ALMOCO: "Saída para o almoço",
  RETORNO_ALMOCO: "Retorno do almoço",
  SAIDA_EXPEDIENTE: "Saída do expediente",
};

export const ENTRY_SHORT: Record<EntryType, string> = {
  ENTRADA: "Entrada",
  SAIDA_ALMOCO: "Saída almoço",
  RETORNO_ALMOCO: "Retorno almoço",
  SAIDA_EXPEDIENTE: "Saída",
};

export const WEEKDAYS = [
  { iso: 1, short: "Seg", long: "Segunda-feira" },
  { iso: 2, short: "Ter", long: "Terça-feira" },
  { iso: 3, short: "Qua", long: "Quarta-feira" },
  { iso: 4, short: "Qui", long: "Quinta-feira" },
  { iso: 5, short: "Sex", long: "Sexta-feira" },
  { iso: 6, short: "Sáb", long: "Sábado" },
  { iso: 7, short: "Dom", long: "Domingo" },
];

const localFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export type LocalNow = {
  date: string;
  time: string;
  hhmm: string;
  weekday: number;
  /** Total de minutos desde 00:00 no fuso da escola. */
  minutes: number;
};

export function nowLocal(base: Date = new Date()): LocalNow {
  const parts = localFormatter.formatToParts(base);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour")) % 24;
  const minute = get("minute");
  const second = get("second");
  const time = `${String(hour).padStart(2, "0")}:${minute}:${second}`;
  return {
    date,
    time,
    hhmm: `${String(hour).padStart(2, "0")}:${minute}`,
    weekday: dayOfWeek(date),
    minutes: hour * 60 + Number(minute),
  };
}

export function dayOfWeek(dateISO: string): number {
  const day = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weekdayLabel(iso: number, long = false): string {
  const item = WEEKDAYS.find((w) => w.iso === iso);
  if (!item) return "";
  return long ? item.long : item.short;
}

export function parseTime(value?: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(total: number): string {
  const safe = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDuration(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null || Number.isNaN(totalMinutes)) return "--";
  const abs = Math.abs(Math.round(totalMinutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function formatSigned(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null) return "--";
  const rounded = Math.round(totalMinutes);
  if (rounded === 0) return "0h";
  return `${rounded > 0 ? "+" : "-"}${formatDuration(rounded)}`;
}

export function formatDateBR(dateISO: string | null | undefined): string {
  if (!dateISO) return "--";
  const [y, m, d] = dateISO.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateLong(dateISO: string): string {
  const iso = dayOfWeek(dateISO);
  return `${weekdayLabel(iso, true)}, ${formatDateBR(dateISO)}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const names = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${names[(m ?? 1) - 1]} de ${y}`;
}

export function currentMonth(): string {
  return nowLocal().date.slice(0, 7);
}

/** Último dia válido do mês (ex.: 2026-09-30 para setembro). */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(total).padStart(2, "0")}`;
}

export function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from(
    { length: total },
    (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );
}


const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Converte um timestamp (UTC/ISO) para dd/mm/aaaa hh:mm no fuso da escola. */
export function formatDateTimeBR(value: string | Date | null | undefined): string {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return dateTimeFormatter.format(date).replace(",", "");
}

/** Data de hoje (AAAA-MM-DD) no fuso da escola — seguro para uso no cliente. */
export function todayISO(base: Date = new Date()): string {
  return nowLocal(base).date;
}

const dateInputFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const toDateInput = (base: Date = new Date()): string => dateInputFormatter.format(base);

/** Valida se uma string AAAA-MM-DD representa uma data real do calendário. */
export function isValidDateISO(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

export function addDays(dateISO: string, days: number): string {
  const base = new Date(`${dateISO}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export type DayEntryMap = Partial<Record<EntryType, string | null>>;

/** Diferença em minutos tratando registros que cruzariam a meia-noite (não suportados). */
export function minutesDiff(from: number | null, to: number | null): number {
  if (from == null || to == null) return 0;
  const diff = to - from;
  if (diff <= 0) return 0; // horários iguais ou invertidos não geram horas
  if (diff > 16 * 60) return 0; // jornadas acima de 16h indicam dados inconsistentes
  return diff;
}

/** Total trabalhado no dia considerando ausências parciais de marcações. */
export function computeWorkedMinutes(day: DayEntryMap): number {
  const entrada = parseTime(day.ENTRADA);
  const saidaAlmoco = parseTime(day.SAIDA_ALMOCO);
  const retorno = parseTime(day.RETORNO_ALMOCO);
  const saida = parseTime(day.SAIDA_EXPEDIENTE);
  let total = 0;

  if (entrada != null) {
    if (saidaAlmoco != null && saidaAlmoco > entrada) total += minutesDiff(entrada, saidaAlmoco);
    else if (retorno != null && retorno > entrada) total += minutesDiff(entrada, retorno);
    else if (saida != null && saida > entrada) total += minutesDiff(entrada, saida);
  }
  total += minutesDiff(retorno, saida);
  return total;
}

export function computeIntervalMinutes(day: DayEntryMap): number {
  const saidaAlmoco = parseTime(day.SAIDA_ALMOCO);
  const retorno = parseTime(day.RETORNO_ALMOCO);
  if (saidaAlmoco != null && retorno != null && retorno > saidaAlmoco) {
    return retorno - saidaAlmoco;
  }
  return 0;
}

export type ScheduleLike = {
  entrada?: string | null;
  saidaAlmoco?: string | null;
  retornoAlmoco?: string | null;
  saidaExpediente?: string | null;
  cargaDiariaMin?: number | null;
};

export function scheduleExpectedMinutes(schedule?: ScheduleLike | null): number {
  if (!schedule) return 0;
  if (schedule.cargaDiariaMin) return schedule.cargaDiariaMin;
  return computeWorkedMinutes({
    ENTRADA: schedule.entrada ?? null,
    SAIDA_ALMOCO: schedule.saidaAlmoco ?? null,
    RETORNO_ALMOCO: schedule.retornoAlmoco ?? null,
    SAIDA_EXPEDIENTE: schedule.saidaExpediente ?? null,
  });
}

export function nextExpectedType(registered: EntryType[]): EntryType {
  for (const type of ENTRY_ORDER) {
    if (!registered.includes(type)) return type;
  }
  return "SAIDA_EXPEDIENTE";
}

export function isLate(
  entrada: string | null | undefined,
  scheduleEntrada: string | null | undefined,
  toleranceMinutes = 10,
): boolean {
  const actual = parseTime(entrada);
  const expected = parseTime(scheduleEntrada);
  if (actual == null || expected == null) return false;
  return actual > expected + toleranceMinutes;
}

export function workedDayStatus(day: DayEntryMap): "COMPLETO" | "PARCIAL" | "VAZIO" {
  const count = ENTRY_ORDER.filter((type) => parseTime(day[type]) != null).length;
  if (count === 0) return "VAZIO";
  if (count === ENTRY_ORDER.length) return "COMPLETO";
  return "PARCIAL";
}

export function businessDays(month: string, diasSemana: number[]): string[] {
  return daysInMonth(month).filter((day) => diasSemana.includes(dayOfWeek(day)));
}

export function slugifyEmail(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 40);
}
