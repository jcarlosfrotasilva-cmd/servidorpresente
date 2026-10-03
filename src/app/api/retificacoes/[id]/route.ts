import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { adjustmentRequests, employees, timeEntries } from "@/db/schema";
import { ApiError, handleRoute, ok, parseIdParam, readJson, reqEnum, reqString } from "@/lib/api";
import { getCurrentUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Somente a gestão pode analisar retificações.", 403);

    const id = parseIdParam((await params).id);
    const body = await readJson(request);
    const decisao = reqEnum(body, "decisao", "a decisão", ["APROVADA", "REJEITADA"] as const);
    const parecer = reqString(body, "parecer", "o parecer", { required: false, max: 600 });

    if (!decisao) throw new ApiError("Informe a decisão: aprovar ou rejeitar.");
    if (decisao === "REJEITADA" && (!parecer || parecer.length < 5)) {
      throw new ApiError("Informe o motivo da rejeição no parecer da gestão.");
    }

    const current = await db
      .select()
      .from(adjustmentRequests)
      .where(eq(adjustmentRequests.id, id))
      .limit(1);
    const solicitacao = current[0];
    if (!solicitacao) throw new ApiError("Solicitação não encontrada.", 404);
    if (solicitacao.status !== "PENDENTE") {
      throw new ApiError("Esta solicitação já foi analisada.", 409);
    }

    if (decisao === "APROVADA") {
      const existing = await db
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.employeeId, solicitacao.employeeId),
            eq(timeEntries.data, solicitacao.data),
            eq(timeEntries.tipo, solicitacao.tipo),
          ),
        )
        .limit(1);

      if (existing[0]) {
        await db
          .update(timeEntries)
          .set({
            hora: solicitacao.horaSolicitada,
            origin: "RETIFICACAO",
            observacao: `Retificado por aprovação de solicitação #${solicitacao.id}.`,
            updatedByUserId: actor.id,
            updatedAt: new Date(),
          })
          .where(eq(timeEntries.id, existing[0].id));
      } else {
        await db.insert(timeEntries).values({
          employeeId: solicitacao.employeeId,
          data: solicitacao.data,
          tipo: solicitacao.tipo,
          hora: solicitacao.horaSolicitada,
          origin: "RETIFICACAO",
          observacao: `Incluído por aprovação de solicitação #${solicitacao.id}.`,
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
        });
      }
    }

    const [updated] = await db
      .update(adjustmentRequests)
      .set({
        status: decisao,
        parecer: parecer || "Aprovado conforme análise da gestão.",
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
      })
      .where(eq(adjustmentRequests.id, id))
      .returning();

    await logAudit({
      actor,
      action: decisao === "APROVADA" ? "APROVAR_RETIFICACAO" : "REJEITAR_RETIFICACAO",
      entity: "adjustment_requests",
      entityId: id,
      details: {
        data: solicitacao.data,
        tipo: solicitacao.tipo,
        horaSolicitada: solicitacao.horaSolicitada,
        parecer,
      },
    });

    return ok({ solicitacao: updated });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);

    const id = parseIdParam((await params).id);
    const current = await db
      .select()
      .from(adjustmentRequests)
      .where(eq(adjustmentRequests.id, id))
      .limit(1);
    const solicitacao = current[0];
    if (!solicitacao) throw new ApiError("Solicitação não encontrada.", 404);

    const isOwner = actor.role === "SERVIDOR" && actor.employeeId === solicitacao.employeeId;
    if (!isOwner && actor.role !== "GESTOR") throw new ApiError("Acesso restrito.", 403);
    if (isOwner && solicitacao.status !== "PENDENTE") {
      throw new ApiError("Solicitações já analisadas não podem ser canceladas.", 409);
    }

    await db.delete(adjustmentRequests).where(eq(adjustmentRequests.id, id));
    await logAudit({
      actor,
      action: "CANCELAR_SOLICITACAO",
      entity: "adjustment_requests",
      entityId: id,
      details: { status: solicitacao.status, data: solicitacao.data, tipo: solicitacao.tipo },
    });

    return ok({ sucesso: true });
  });
}

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    const id = parseIdParam((await params).id);

    const rows = await db
      .select({
        id: adjustmentRequests.id,
        employeeId: adjustmentRequests.employeeId,
        employeeNome: employees.nome,
        data: adjustmentRequests.data,
        tipo: adjustmentRequests.tipo,
        horaSolicitada: adjustmentRequests.horaSolicitada,
        motivo: adjustmentRequests.motivo,
        status: adjustmentRequests.status,
        parecer: adjustmentRequests.parecer,
      })
      .from(adjustmentRequests)
      .innerJoin(employees, eq(adjustmentRequests.employeeId, employees.id))
      .where(eq(adjustmentRequests.id, id))
      .limit(1);

    const solicitacao = rows[0];
    if (!solicitacao) throw new ApiError("Solicitação não encontrada.", 404);
    if (actor.role === "SERVIDOR" && actor.employeeId !== solicitacao.employeeId) {
      throw new ApiError("Acesso restrito.", 403);
    }
    return ok({ solicitacao });
  });
}
