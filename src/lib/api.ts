export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status });
}

export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, error.status);
    console.error("[api]", error);
    return fail("Erro inesperado ao processar a solicitação.", 500);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError("Corpo da requisição inválido.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Corpo da requisição inválido.");
  }
}

export function reqString(
  body: Record<string, unknown>,
  field: string,
  label: string,
  { required = true, max = 240 }: { required?: boolean; max?: number } = {},
): string {
  const raw = body[field];
  if (raw == null || raw === "") {
    if (required) throw new ApiError(`Informe ${label}.`);
    return "";
  }
  const value = String(raw).trim();
  if (required && value.length === 0) throw new ApiError(`Informe ${label}.`);
  if (value.length > max) throw new ApiError(`${label} deve ter no máximo ${max} caracteres.`);
  return value;
}

export function reqTime(
  body: Record<string, unknown>,
  field: string,
  label: string,
  { required = true }: { required?: boolean } = {},
): string | null {
  const raw = body[field];
  if (raw == null || raw === "") {
    if (required) throw new ApiError(`Informe ${label}.`);
    return null;
  }
  const value = String(raw).trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new ApiError(`${label} deve estar no formato HH:MM.`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new ApiError(`${label} inválido.`);
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

export function reqInt(
  body: Record<string, unknown>,
  field: string,
  label: string,
  { required = true, min, max }: { required?: boolean; min?: number; max?: number } = {},
): number | null {
  const raw = body[field];
  if (raw == null || raw === "") {
    if (required) throw new ApiError(`Informe ${label}.`);
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ApiError(`${label} deve ser um número inteiro.`);
  }
  if (min != null && value < min) throw new ApiError(`${label} deve ser de no mínimo ${min}.`);
  if (max != null && value > max) throw new ApiError(`${label} deve ser de no máximo ${max}.`);
  return value;
}

export function reqDate(
  body: Record<string, unknown>,
  field: string,
  label: string,
  { required = true }: { required?: boolean } = {},
): string | null {
  const raw = body[field];
  if (raw == null || raw === "") {
    if (required) throw new ApiError(`Informe ${label}.`);
    return null;
  }
  const value = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(`${label} inválida.`);
  return value;
}

export function reqBool(
  body: Record<string, unknown>,
  field: string,
  fallback: boolean,
): boolean {
  const raw = body[field];
  if (raw == null) return fallback;
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === "1" || raw === 1) return true;
  if (raw === "false" || raw === "0" || raw === 0) return false;
  return fallback;
}

export function reqEnum<T extends string>(
  body: Record<string, unknown>,
  field: string,
  label: string,
  allowed: readonly T[],
  { required = true }: { required?: boolean } = {},
): T | null {
  const raw = body[field];
  if (raw == null || raw === "") {
    if (required) throw new ApiError(`Selecione ${label}.`);
    return null;
  }
  const value = String(raw) as T;
  if (!allowed.includes(value)) throw new ApiError(`${label} inválido.`);
  return value;
}

export function reqWeekdays(
  body: Record<string, unknown>,
  field: string,
  label: string,
): number[] {
  const raw = body[field];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError(`Selecione ao menos um dia em ${label}.`);
  }
  const days = raw.map((item) => Number(item));
  if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new ApiError(`${label} possui dias inválidos.`);
  }
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

export function parseIdParam(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Identificador inválido.", 400);
  return id;
}
