import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bancoHoras, bancoHorasSolicitacoes } from "@/db/schema";
import { ApiError, handleRoute, ok, parseIdParam, readJson, reqEnum } from "@/lib/api";
import { getCurrentUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const body = await readJson(request);
const decisao = reqEnum(body, "decisao", "a decisão", ["APROVADA", "REJEITADA"] as const);
    if (!decisao) throw new ApiError("Decisão não informada.");
    const justificativa = body.justificativa as string | undefined;

    const solicitacao = await db
      .select()
      .from(bancoHorasSolicitacoes)
      .where(eq(bancoHorasSolicitacoes.id, id))
      .limit(1);

    if (!solicitacao[0]) throw new ApiError("Solicitação não encontrada.", 404);
    if (solicitacao[0].status !== "PENDENTE") {
      throw new ApiError("Solicitação já foi analisada.", 409);
    }

    // Atualizar solicitação
    const [atualizada] = await db
      .update(bancoHorasSolicitacoes)
      .set({
        status: decisao,
        aprovadoPorUserId: actor.id,
        aprovadoEm: new Date(),
        justificativaAprovacao: justificativa || null,
      })
      .where(eq(bancoHorasSolicitacoes.id, id))
      .returning();

    // Se aprovada, criar movimentação no banco
    if (decisao === "APROVADA") {
      const saldoAnterior = await db
        .select({ total: sql<number>`COALESCE(SUM(${bancoHoras.minutos}), 0)::int` })
        .from(bancoHoras)
        .where(eq(bancoHoras.employeeId, solicitacao[0].employeeId));

      const novoSaldo = Number(saldoAnterior[0]?.total ?? 0) + solicitacao[0].minutos;

      await db.insert(bancoHoras).values({
        employeeId: solicitacao[0].employeeId,
        data: solicitacao[0].dataUso || solicitacao[0].dataSolicitacao,
        tipo: solicitacao[0].tipo,
        minutos: solicitacao[0].minutos,
        saldoAcumulado: novoSaldo,
        descricao: `Solicitação #${id} aprovada: ${solicitacao[0].motivo}`,
        solicitacaoId: id,
        aprovadoPorUserId: actor.id,
        aprovadoEm: new Date(),
      });
    }

    await logAudit({
      actor,
      action: decisao === "APROVADA" ? "APROVAR_BANCO_HORAS" : "REJEITAR_BANCO_HORAS",
      entity: "banco_horas_solicitacoes",
      entityId: id,
      details: { tipo: solicitacao[0].tipo, minutos: solicitacao[0].minutos, justificativa },
    });

    return ok({ solicitacao: atualizada, aprovada: decisao === "APROVADA" });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    await db.delete(bancoHorasSolicitacoes).where(eq(bancoHorasSolicitacoes.id, id));

    await logAudit({
      actor,
      action: "EXCLUIR_SOLICITACAO_BANCO_HORAS",
      entity: "banco_horas_solicitacoes",
      entityId: id,
    });

    return ok({ sucesso: true });
  });
}
