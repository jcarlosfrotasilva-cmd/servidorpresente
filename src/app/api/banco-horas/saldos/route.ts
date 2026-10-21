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

    const saldos = await db
      .select({
        employeeId: bancoHoras.employeeId,
        nome: employees.nome,
        matricula: employees.matricula,
        total: sql<number>`COALESCE(SUM(${bancoHoras.minutos}), 0)::int`,
      })
      .from(bancoHoras)
      .innerJoin(employees, eq(bancoHoras.employeeId, employees.id))
      .groupBy(bancoHoras.employeeId, employees.nome, employees.matricula)
      .orderBy(sql`${employees.nome}`);

    return ok({
      saldos: saldos.map((s) => ({
        employeeId: s.employeeId,
        nome: s.nome,
        matricula: s.matricula,
        saldoMinutos: s.total,
        saldoFormatado: formatarHoras(s.total),
      })),
    });
  });
}
