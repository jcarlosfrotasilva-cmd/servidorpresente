import { eq } from "drizzle-orm";
import { db } from "@/db";
import { holidays } from "@/db/schema";
import {
  ApiError,
  handleRoute,
  ok,
  parseIdParam,
  readJson,
  reqBool,
  reqDate,
  reqEnum,
  reqString,
} from "@/lib/api";
import { HOLIDAY_TIPOS, type HolidayTipo } from "@/lib/ausencias";
import { getCurrentUser, logAudit } from "@/lib/session";
import { dayOfWeek, isValidDateISO } from "@/lib/time";

export const dynamic = "force-dynamic";

const TIPOS = HOLIDAY_TIPOS.map((item) => item.value);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const current = await db.select().from(holidays).where(eq(holidays.id, id)).limit(1);
    const feriado = current[0];
    if (!feriado) throw new ApiError("Data não encontrada.", 404);

    const body = await readJson(request);
    const data =
      reqDate(body, "data", "a data", { required: false }) ?? feriado.data;
    if (!isValidDateISO(data)) throw new ApiError("Data inválida.");
    const nome = reqString(body, "nome", "o nome da data", {
      required: false,
      max: 120,
    }) || feriado.nome;
    const tipo = (reqEnum(body, "tipo", "o tipo", TIPOS, { required: false }) ??
      feriado.tipo) as HolidayTipo;
    const bloqueiaPonto = reqBool(body, "bloqueiaPonto", feriado.bloqueiaPonto);
    const descricao = reqString(body, "descricao", "a descrição", { required: false, max: 400 });

    const conflito = await db
      .select({ id: holidays.id })
      .from(holidays)
      .where(eq(holidays.data, data))
      .limit(1);
    if (conflito[0] && conflito[0].id !== id) {
      throw new ApiError("Já existe outra data cadastrada com este dia.");
    }

    const [updated] = await db
      .update(holidays)
      .set({
        data,
        nome,
        tipo,
        bloqueiaPonto,
        descricao: descricao || null,
        updatedAt: new Date(),
      })
      .where(eq(holidays.id, id))
      .returning();

    await logAudit({
      actor,
      action: "ATUALIZAR_FERIADO",
      entity: "holidays",
      entityId: id,
      details: {
        antes: { data: feriado.data, tipo: feriado.tipo, bloqueiaPonto: feriado.bloqueiaPonto },
        depois: { data, tipo, bloqueiaPonto },
      },
    });

    return ok({ feriado: { ...updated, diaSemana: dayOfWeek(updated.data) } });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const current = await db.select().from(holidays).where(eq(holidays.id, id)).limit(1);
    const feriado = current[0];
    if (!feriado) throw new ApiError("Data não encontrada.", 404);

    await db.delete(holidays).where(eq(holidays.id, id));
    await logAudit({
      actor,
      action: "EXCLUIR_FERIADO",
      entity: "holidays",
      entityId: id,
      details: { data: feriado.data, nome: feriado.nome, tipo: feriado.tipo },
    });

    return ok({ sucesso: true });
  });
}
