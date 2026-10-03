import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, livroPontoFechamentos } from "@/db/schema";
import { ApiError, handleRoute, ok, readJson, reqInt, reqString } from "@/lib/api";
import { buildLivroPonto } from "@/lib/livro-ponto";
import { getCurrentUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Fecha a competência do Livro Ponto (atestado da autoridade competente). */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const body = await readJson(request);
    const employeeId = reqInt(body, "employeeId", "o servidor", { min: 1 });
    const mes = reqString(body, "mes", "a competência", { max: 7 });
    const ocorrencias = reqString(body, "ocorrencias", "as ocorrências", {
      required: false,
      max: 900,
    });

    if (!employeeId) throw new ApiError("Servidor não informado.");
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new ApiError("Competência inválida (use AAAA-MM).");

    const [servidor] = await db
      .select({ id: employees.id, nome: employees.nome })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    if (!servidor) throw new ApiError("Servidor não encontrado.", 404);

    const documento = await buildLivroPonto(employeeId, mes);
    if (!documento) throw new ApiError("Não foi possível apurar a competência.", 400);

    if (documento.dias.length === 0) {
      throw new ApiError(
        "Não há registros apuráveis nesta competência. Confira o horário de trabalho do servidor antes de fechar o livro ponto.",
      );
    }

    if (documento.fechamento) {
      throw new ApiError("A competência já está fechada. Reabra antes de fechar novamente.", 409);
    }

    const [created] = await db
      .insert(livroPontoFechamentos)
      .values({
        employeeId,
        mes,
        protocolo: documento.protocolo,
        totalMinutos: documento.totais.totalMinutos,
        diasFalta: documento.totais.diasFaltas,
        ocorrencias: ocorrencias || null,
        fechadoPorUserId: actor.id,
        fechadoPorNome: actor.nome,
      })
      .returning();

    await logAudit({
      actor,
      action: "FECHAR_LIVRO_PONTO",
      entity: "livro_ponto_fechamentos",
      entityId: created.id,
      details: {
        servidor: servidor.nome,
        mes,
        protocolo: documento.protocolo,
        totalMinutos: documento.totais.totalMinutos,
        diasFalta: documento.totais.diasFaltas,
      },
    });

    return ok({ fechamento: created, documento }, 201);
  });
}

/** Reabre a competência (permite novos lançamentos e correções). */
export async function DELETE(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const url = new URL(request.url);
    const employeeId = Number(url.searchParams.get("employeeId"));
    const mes = url.searchParams.get("mes") ?? "";
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new ApiError("Servidor não informado.");
    }
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new ApiError("Competência inválida (use AAAA-MM).");

    const [existente] = await db
      .select()
      .from(livroPontoFechamentos)
      .where(
        and(eq(livroPontoFechamentos.employeeId, employeeId), eq(livroPontoFechamentos.mes, mes)),
      )
      .limit(1);
    if (!existente) throw new ApiError("Competência não está fechada.", 404);

    await db.delete(livroPontoFechamentos).where(eq(livroPontoFechamentos.id, existente.id));

    await logAudit({
      actor,
      action: "REABRIR_LIVRO_PONTO",
      entity: "livro_ponto_fechamentos",
      entityId: existente.id,
      details: { mes, protocolo: existente.protocolo },
    });

    return ok({ sucesso: true });
  });
}
