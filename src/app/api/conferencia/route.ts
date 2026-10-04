import { ApiError, handleRoute, ok } from "@/lib/api";
import { buildConferencia, STATUS_META } from "@/lib/conferencia";
import { getCurrentUser } from "@/lib/session";
import { currentMonth, formatDateBR, monthLabel, nowLocal, weekdayLabel, dayOfWeek } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function normalizarData(valor: string | null, mes: string): string {
  if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const hoje = nowLocal().date;
  return hoje.slice(0, 7) === mes ? hoje : `${mes}-01`;
}

export async function GET(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const url = new URL(request.url);
    const mesParam = url.searchParams.get("mes");
    const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : currentMonth();
    const data = normalizarData(url.searchParams.get("data"), mes);
    const formato = url.searchParams.get("formato");

    const resultado = await buildConferencia(mes, data);

    if (formato === "csv") {
      const linhas: string[] = [];
      linhas.push(`CONFERENCIA DE FREQUENCIA;COMPETENCIA;${mes}`);
      linhas.push(`;GERADO EM;${formatDateBR(resultado.hoje)}`);
      linhas.push("");
      linhas.push("SITUACAO DO DIA;" + formatDateBR(data) + ";" + weekdayLabel(dayOfWeek(data), true));
      linhas.push(
        ["Servidor", "Matricula", "Cargo", "Horario do dia", "Batidas", "Registradas", "Previstas", "Situacao", "Apurado (min)", "Previsto (min)", "Saldo (min)", "Observacao"].join(
          ";",
        ),
      );
      for (const item of resultado.dia) {
        linhas.push(
          [
            item.nome,
            item.matricula,
            item.cargo,
            item.horarioLabel,
            item.batidas.map((b) => `${b.label}: ${b.hora ?? "--"}`).join(" | "),
            item.registradas,
            item.previstas,
            item.statusLabel,
            item.workedMinutes,
            item.expectedMinutes,
            item.saldo,
            [item.ausencia, item.feriado, item.atraso ? "atraso na entrada" : null]
              .filter(Boolean)
              .join(" / "),
          ]
            .map((valor) => String(valor).replace(/;/g, ","))
            .join(";"),
        );
      }
      linhas.push("");
      linhas.push("CONSOLIDADO DO MES;" + monthLabel(mes));
      linhas.push(
        [
          "Servidor",
          "Matricula",
          "Dias previstos",
          "Registro total",
          "Registro parcial",
          "Nao registrou",
          "Ausencias justificadas",
          "Feriados",
          "Dias extras",
          "Atrasos",
          "Horas apuradas",
          "Horas previstas",
          "Saldo",
        ].join(";"),
      );
      for (const item of resultado.mesLinhas) {
        linhas.push(
          [
            item.nome,
            item.matricula,
            item.diasPrevistos,
            item.completos,
            item.parciais,
            item.semRegistro,
            item.ausencias,
            item.feriados,
            item.extras,
            item.atrasos,
            (item.totalMinutos / 60).toFixed(2).replace(".", ","),
            (item.esperadoMinutos / 60).toFixed(2).replace(".", ","),
            (item.saldoMinutos / 60).toFixed(2).replace(".", ","),
          ]
            .map((valor) => String(valor).replace(/;/g, ","))
            .join(";"),
        );
      }

      return new Response(`\uFEFF${linhas.join("\n")}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="conferencia-ponto-${mes}.csv"`,
        },
      });
    }

    return ok({
      ...resultado,
      mesLabel: monthLabel(mes),
      dataLabel: `${weekdayLabel(dayOfWeek(data), true)}, ${formatDateBR(data)}`,
      status: STATUS_META,
    });
  });
}
