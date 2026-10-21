import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bancoHorasSolicitacoes, employees } from "@/db/schema";
import { ApiError, handleRoute, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito.", 403);

    const solicitacoes = await db
      .select({
        id: bancoHorasSolicitacoes.id,
        employeeId: bancoHorasSolicitacoes.employeeId,
        employeeNome: employees.nome,
        tipo: bancoHorasSolicitacoes.tipo,
        minutos: bancoHorasSolicitacoes.minutos,
        motivo: bancoHorasSolicitacoes.motivo,
        status: bancoHorasSolicitacoes.status,
        dataSolicitacao: bancoHorasSolicitacoes.dataSolicitacao,
        dataUso: bancoHorasSolicitacoes.dataUso,
        aprovadoEm: bancoHorasSolicitacoes.aprovadoEm,
        justificativa: bancoHorasSolicitacoes.justificativaAprovacao,
      })
      .from(bancoHorasSolicitacoes)
      .innerJoin(employees, eq(bancoHorasSolicitacoes.employeeId, employees.id))
      .orderBy(desc(bancoHorasSolicitacoes.dataSolicitacao))
      .limit(100);

    return ok({ solicitacoes });
  });
}
