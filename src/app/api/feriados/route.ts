import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { holidays } from "@/db/schema";
import {
  ApiError,
  handleRoute,
  ok,
  readJson,
  reqBool,
  reqDate,
  reqEnum,
  reqString,
} from "@/lib/api";
import { HOLIDAY_TIPOS, type HolidayTipo } from "@/lib/ausencias";
import { getCurrentUser, logAudit } from "@/lib/session";
import { dayOfWeek, isValidDateISO, nowLocal } from "@/lib/time";

export const dynamic = "force-dynamic";

const TIPOS = HOLIDAY_TIPOS.map((item) => item.value);

export async function GET(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);

    const url = new URL(request.url);
    const ano = url.searchParams.get("ano");
    const hoje = nowLocal().date;
    const inicio = url.searchParams.get("de") ?? (ano ? `${ano}-01-01` : `${hoje.slice(0, 4)}-01-01`);
    const fim = url.searchParams.get("ate") ?? (ano ? `${ano}-12-31` : `${hoje.slice(0, 4)}-12-31`);

    const rows = await db
      .select()
      .from(holidays)
      .where(and(gte(holidays.data, inicio), lte(holidays.data, fim)))
      .orderBy(asc(holidays.data));

    const proximos = await db
      .select()
      .from(holidays)
      .where(gte(holidays.data, hoje))
      .orderBy(asc(holidays.data))
      .limit(6);

    const anos = await db
      .select({ data: holidays.data })
      .from(holidays)
      .orderBy(asc(holidays.data));

    const periodo = { inicio, fim };
    return ok({
      feriados: rows.map((row) => ({ ...row, diaSemana: dayOfWeek(row.data) })),
      proximos: proximos.map((row) => ({ ...row, diaSemana: dayOfWeek(row.data) })),
      periodo,
      anosDisponiveis: Array.from(
        new Set(anos.map((row) => Number(row.data.slice(0, 4)))),
      ).sort((a, b) => b - a),
      tipos: HOLIDAY_TIPOS,
      podeEditar: actor.role === "GESTOR",
    });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const body = await readJson(request);
    const data = reqDate(body, "data", "a data");
    const nome = reqString(body, "nome", "o nome da data", { max: 120 });
    const tipo = (reqEnum(body, "tipo", "o tipo", TIPOS) ?? "FERIADO") as HolidayTipo;
    const bloqueiaPonto = reqBool(body, "bloqueiaPonto", true);
    const descricao = reqString(body, "descricao", "a descrição", { required: false, max: 400 });

    if (!data || !isValidDateISO(data)) throw new ApiError("Data inválida.");

    const existente = await db
      .select({ id: holidays.id })
      .from(holidays)
      .where(eq(holidays.data, data))
      .limit(1);
    if (existente[0]) {
      throw new ApiError("Já existe um feriado ou ponto facultativo cadastrado nesta data.");
    }

    const [created] = await db
      .insert(holidays)
      .values({
        data,
        nome,
        tipo,
        bloqueiaPonto,
        descricao: descricao || null,
        createdByUserId: actor.id,
      })
      .returning();

    await logAudit({
      actor,
      action: "CRIAR_FERIADO",
      entity: "holidays",
      entityId: created.id,
      details: { data, nome, tipo, bloqueiaPonto },
    });

    return ok({ feriado: { ...created, diaSemana: dayOfWeek(created.data) } }, 201);
  });
}
