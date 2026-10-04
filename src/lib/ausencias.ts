/**
 * Constantes e regras puras sobre feriados e ausências.
 * Este arquivo NÃO importa o banco para poder ser usado no cliente.
 */

export type Tone = "brand" | "success" | "warning" | "danger" | "neutral" | "info";

export type HolidayTipo = "FERIADO" | "PONTO_FACULTATIVO" | "RECESSO" | "SUSPENSAO";

export const HOLIDAY_TIPOS: { value: HolidayTipo; label: string; tone: Tone }[] = [
  { value: "FERIADO", label: "Feriado", tone: "danger" },
  { value: "PONTO_FACULTATIVO", label: "Ponto facultativo", tone: "warning" },
  { value: "RECESSO", label: "Recesso escolar", tone: "info" },
  { value: "SUSPENSAO", label: "Suspensão de aulas", tone: "neutral" },
];

export const HOLIDAY_LABEL: Record<string, string> = Object.fromEntries(
  HOLIDAY_TIPOS.map((item) => [item.value, item.label]),
);

export const HOLIDAY_TONE: Record<string, Tone> = Object.fromEntries(
  HOLIDAY_TIPOS.map((item) => [item.value, item.tone]),
);

export type AusenciaTipo =
  | "FERIAS"
  | "LICENCA_SAUDE"
  | "LICENCA_PREMIO"
  | "ORIENTACAO_TECNICA"
  | "DOENCA"
  | "ATESTADO"
  | "FALTA_JUSTIFICADA"
  | "FOLGA_COMPENSACAO"
  | "SUSPENSAO"
  | "OUTROS";

export const AUSENCIA_TIPOS: {
  value: AusenciaTipo;
  label: string;
  short: string;
  tone: Tone;
}[] = [
  { value: "FERIAS", label: "Férias", short: "Férias", tone: "info" },
  { value: "LICENCA_SAUDE", label: "Licença saúde", short: "Lic. saúde", tone: "warning" },
  { value: "LICENCA_PREMIO", label: "Licença-prêmio", short: "Lic. prêmio", tone: "info" },
  {
    value: "ORIENTACAO_TECNICA",
    label: "Orientação técnica",
    short: "Orient. técnica",
    tone: "brand",
  },
  { value: "DOENCA", label: "Afastamento por doença", short: "Doença", tone: "warning" },
  { value: "ATESTADO", label: "Atestado médico", short: "Atestado", tone: "warning" },
  {
    value: "FALTA_JUSTIFICADA",
    label: "Falta justificada",
    short: "Falta justif.",
    tone: "neutral",
  },
  {
    value: "FOLGA_COMPENSACAO",
    label: "Folga/compensação",
    short: "Folga comp.",
    tone: "neutral",
  },
  { value: "SUSPENSAO", label: "Suspensão", short: "Suspensão", tone: "danger" },
  { value: "OUTROS", label: "Outros (descrever no motivo)", short: "Outros", tone: "neutral" },
];

export const AUSENCIA_LABEL: Record<string, string> = Object.fromEntries(
  AUSENCIA_TIPOS.map((item) => [item.value, item.label]),
);

export const AUSENCIA_SHORT: Record<string, string> = Object.fromEntries(
  AUSENCIA_TIPOS.map((item) => [item.value, item.short]),
);

export const AUSENCIA_TONE: Record<string, Tone> = Object.fromEntries(
  AUSENCIA_TIPOS.map((item) => [item.value, item.tone]),
);

export const PERIODO_OPTIONS: { value: "DIA_INTEIRO" | "PARCIAL"; label: string }[] = [
  { value: "DIA_INTEIRO", label: "Dia inteiro (todos os dias do período)" },
  { value: "PARCIAL", label: "Parcial — apenas uma faixa de horas" },
];

export type Ausencia = {
  id?: number;
  employeeId: number;
  employeeNome?: string;
  tipo: AusenciaTipo | string;
  periodo: "DIA_INTEIRO" | "PARCIAL" | string;
  dataInicio: string;
  dataFim: string;
  horaInicio: string | null;
  horaFim: string | null;
  motivo?: string | null;
  documento?: string | null;
  status?: string;
};

/** Minutos desde 00:00 a partir de "HH:MM(:SS)". */
export function toMinutes(value?: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value).trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isFullDay(ausencia: Pick<Ausencia, "periodo">): boolean {
  return ausencia.periodo !== "PARCIAL";
}

export function absenceWindow(
  ausencia: Pick<Ausencia, "periodo" | "horaInicio" | "horaFim">,
): { inicio: number; fim: number } | null {
  if (isFullDay(ausencia)) return { inicio: 0, fim: 1440 };
  const inicio = toMinutes(ausencia.horaInicio);
  const fim = toMinutes(ausencia.horaFim);
  if (inicio == null || fim == null || fim <= inicio) return null;
  return { inicio, fim };
}

export function insideAbsence(
  minutes: number,
  ausencia: Pick<Ausencia, "periodo" | "horaInicio" | "horaFim">,
): boolean {
  const window = absenceWindow(ausencia);
  if (!window) return false;
  return minutes >= window.inicio && minutes < window.fim;
}

/** Ausência (dentre as do dia) que cobre o horário informado. */
export function coveringAbsence<T extends Ausencia>(list: T[], minutes: number): T | null {
  return list.find((ausencia) => insideAbsence(minutes, ausencia)) ?? null;
}

export function absenceLabel(tipo?: string | null): string {
  return (tipo && AUSENCIA_LABEL[tipo]) || "Ausência";
}

export function absenceTone(tipo?: string | null): Tone {
  return (tipo && AUSENCIA_TONE[tipo]) || "neutral";
}

export function holidayTone(tipo?: string | null): Tone {
  return (tipo && HOLIDAY_TONE[tipo]) || "danger";
}

export function holidayLabel(tipo?: string | null): string {
  return (tipo && HOLIDAY_LABEL[tipo]) || "Feriado";
}

export function absencePeriodLabel(ausencia: Pick<Ausencia, "periodo" | "horaInicio" | "horaFim">) {
  if (isFullDay(ausencia)) return "Dia inteiro";
  const inicio = ausencia.horaInicio?.slice(0, 5) ?? "--:--";
  const fim = ausencia.horaFim?.slice(0, 5) ?? "--:--";
  return `Parcial · ${inicio} às ${fim}`;
}

export function holidaysBlockingPoint<T extends { bloqueiaPonto: boolean }>(list: T[]): T[] {
  return list.filter((holiday) => holiday.bloqueiaPonto);
}
