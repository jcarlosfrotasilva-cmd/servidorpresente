import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bancoHoras, employees } from "@/db/schema";
import { ApiError, handleRoute, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function formatarHoras(minutos: number): string {
  const horas = Math.floor(Math.abs(minutos) / 60);
  const mins = Math.abs(minutos) % 60;
  const sinal = minutos < 0 ? "-" : "";
  return `${sinal}${horas}h${String(mins).padStart(2, "0")}min`;
}

export async function GET() {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito.", 403);

    try {
      // Buscar TODOS os servidores ativos com seus saldos
      const todosServidores = await db
        .select({
          employeeId: employees.id,
          nome: employees.nome,
          matricula: employees.matricula,
          cargo: employees.cargo,
        })
        .from(employees)
        .where(eq(employees.ativo, true))
        .orderBy(sql`${employees.nome}`);

      // Buscar saldos do banco de horas
      const saldosBH = await db
        .select({
          employeeId: bancoHoras.employeeId,
          total: sql<number>`COALESCE(SUM(${bancoHoras.minutos}), 0)::int`,
        })
        .from(bancoHoras)
        .groupBy(bancoHoras.employeeId);

      // Criar mapa de saldos
      const saldoMap = new Map(saldosBH.map(s => [s.employeeId, s.total]));

      // Montar lista completa
      const saldos = todosServidores.map(s => {
        const saldoMinutos = saldoMap.get(s.employeeId) || 0;
        return {
          employeeId: s.employeeId,
          nome: s.nome,
          matricula: s.matricula,
          cargo: s.cargo,
          saldoMinutos,
          saldoFormatado: formatarHoras(saldoMinutos),
        };
      });

      // Ordenar: maiores positivos primeiro, depois zerados, depois negativos
      saldos.sort((a, b) => {
        if (a.saldoMinutos > 0 && b.saldoMinutos <= 0) return -1;
        if (a.saldoMinutos <= 0 && b.saldoMinutos > 0) return 1;
        if (a.saldoMinutos < 0 && b.saldoMinutos >= 0) return 1;
        if (a.saldoMinutos >= 0 && b.saldoMinutos < 0) return -1;
        return b.saldoMinutos - a.saldoMinutos;
      });

      return ok({ saldos });
    } catch (e) {
      // Se tabela não existir, retornar lista vazia
      return ok({ saldos: [] });
    }
  });
}
