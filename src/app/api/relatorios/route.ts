import { ApiError, handleRoute, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { buildMonthlyReport } from "@/lib/reports";
import { currentMonth } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function parseMonth(value: string | null): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return currentMonth();
}

export async function GET(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);

    const url = new URL(request.url);
    const mes = parseMonth(url.searchParams.get("mes"));
    const formato = url.searchParams.get("formato");

    const employeeIdParam = url.searchParams.get("employeeId");
    let employeeIds: number[] | undefined;
    if (actor.role === "SERVIDOR") {
      if (!actor.employeeId) throw new ApiError("Usuário sem servidor vinculado.", 400);
      employeeIds = [actor.employeeId];
    } else if (employeeIdParam && employeeIdParam !== "todos") {
      employeeIds = [Number(employeeIdParam)];
    }

    const report = await buildMonthlyReport(mes, employeeIds);

    if (formato === "csv") {
      if (actor.role !== "GESTOR") throw new ApiError("Exportação restrita à gestão.", 403);
      const header = [
        "Matrícula",
        "Servidor",
        "Cargo",
        "Jornada",
        "Dias trabalhados",
        "Faltas",
        "Dias incompletos",
        "Atrasos",
        "Horas trabalhadas",
        "Horas previstas",
        "Saldo",
      ];
      const lines = [header.join(";")];
      for (const row of report.rows) {
        lines.push(
          [
            row.matricula,
            row.nome,
            row.cargo,
            row.modeloNome ?? "Horário individual",
            row.diasTrabalhados,
            row.diasFalta,
            row.diasIncompletos,
            row.atrasos,
            (row.totalMinutos / 60).toFixed(2).replace(".", ","),
            (row.esperadoMinutos / 60).toFixed(2).replace(".", ","),
            (row.saldoMinutos / 60).toFixed(2).replace(".", ","),
          ].join(";"),
        );
      }
      return new Response(`\uFEFF${lines.join("\n")}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="relatorio-ponto-${mes}.csv"`,
        },
      });
    }

    return ok(report);
  });
}
