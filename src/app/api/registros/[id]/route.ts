import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries } from "@/db/schema";
import {
  ApiError,
  handleRoute,
  ok,
  parseIdParam,
  readJson,
  reqDate,
  reqEnum,
  reqString,
  reqTime,
} from "@/lib/api";
import { getCurrentUser, logAudit } from "@/lib/session";
import { ENTRY_ORDER } from "@/lib/time";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") {
      throw new ApiError(
        "Apenas a gestão pode alterar registros. Utilize a solicitação de retificação.",
        403,
      );
    }

    const id = parseIdParam((await params).id);
    const body = await readJson(request);

    const current = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).limit(1);
    const registro = current[0];
    if (!registro) throw new ApiError("Registro não encontrado.", 404);

    const data = reqDate(body, "data", "a data") ?? registro.data;
    const tipo = reqEnum(body, "tipo", "o tipo de marcação", ENTRY_ORDER) ?? registro.tipo;
    const hora = reqTime(body, "hora", "o horário") ?? registro.hora;
    const observacao = reqString(body, "observacao", "a observação", {
      required: false,
      max: 400,
    });

    const conflict = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, registro.employeeId),
          eq(timeEntries.data, data),
          eq(timeEntries.tipo, tipo),
        ),
      )
      .limit(1);
    if (conflict[0] && conflict[0].id !== id) {
      throw new ApiError("Já existe uma marcação deste tipo nesta data para o servidor.");
    }

    const [updated] = await db
      .update(timeEntries)
      .set({
        data,
        tipo,
        hora,
        observacao: observacao || registro.observacao,
        origin: "GESTOR",
        updatedByUserId: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(timeEntries.id, id))
      .returning();

    await logAudit({
      actor,
      action: "ATUALIZAR_REGISTRO",
      entity: "time_entries",
      entityId: id,
      details: {
        antes: { data: registro.data, tipo: registro.tipo, hora: registro.hora },
        depois: { data, tipo, hora },
      },
    });

    return ok({ registro: updated });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const current = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).limit(1);
    const registro = current[0];
    if (!registro) throw new ApiError("Registro não encontrado.", 404);

    await db.delete(timeEntries).where(eq(timeEntries.id, id));

    await logAudit({
      actor,
      action: "EXCLUIR_REGISTRO",
      entity: "time_entries",
      entityId: id,
      details: { data: registro.data, tipo: registro.tipo, hora: registro.hora },
    });

    return ok({ sucesso: true });
  });
}
