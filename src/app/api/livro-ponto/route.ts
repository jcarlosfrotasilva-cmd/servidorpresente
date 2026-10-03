import { ApiError, handleRoute, ok } from "@/lib/api";
import { buildLivroPonto, listLivroPonto } from "@/lib/livro-ponto";
import { getCurrentUser } from "@/lib/session";
import { currentMonth } from "@/lib/time";

export const dynamic = "force-dynamic";

function parseMes(value: string | null): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return currentMonth();
}

export async function GET(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);

    const url = new URL(request.url);
    const mes = parseMes(url.searchParams.get("mes"));
    const employeeParam = url.searchParams.get("employeeId");

    // Servidor: sempre o próprio documento.
    if (actor.role === "SERVIDOR" || employeeParam === "meu") {
      if (!actor.employeeId) throw new ApiError("Usuário sem servidor vinculado.", 400);
      const documento = await buildLivroPonto(actor.employeeId, mes);
      if (!documento) throw new ApiError("Servidor não encontrado.", 404);
      return ok({ documento, podeFechar: actor.role === "GESTOR" });
    }

    if (employeeParam && employeeParam !== "todos") {
      const documento = await buildLivroPonto(Number(employeeParam), mes);
      if (!documento) throw new ApiError("Servidor não encontrado.", 404);
      return ok({ documento, podeFechar: true });
    }

    const lista = await listLivroPonto(mes);
    return ok({
      mes,
      livros: lista,
      podeFechar: actor.role === "GESTOR",
      totais: {
        servidores: lista.length,
        fechados: lista.filter((item) => item.fechadoEm).length,
        pendentes: lista.filter((item) => !item.fechadoEm).length,
        totalMinutos: lista.reduce((acc, item) => acc + item.totalMinutos, 0),
        esperadoMinutos: lista.reduce((acc, item) => acc + item.esperadoMinutos, 0),
        diasFaltas: lista.reduce((acc, item) => acc + item.diasFaltas, 0),
        ocorrencias: lista.reduce((acc, item) => acc + item.diasAusencia + item.diasFeriado, 0),
      },
    });
  });
}
