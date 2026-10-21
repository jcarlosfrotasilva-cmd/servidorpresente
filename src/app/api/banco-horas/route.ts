import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bancoHoras, bancoHorasConfig, bancoHorasSolicitacoes, employees } from "@/db/schema";
import { ApiError, handleRoute, ok, readJson, reqInt, reqString } from "@/lib/api";
import { getCurrentUser, logAudit } from "@/lib/session";
import { currentMonth, monthEnd } from "@/lib/time";

export const dynamic = "force-dynamic";

function formatarHoras(minutos: number): string {
  const horas = Math.floor(Math.abs(minutos) / 60);
  const mins = Math.abs(minutos) % 60;
  const sinal = minutos < 0 ? "-" : "";
  return `${sinal}${horas}h${String(mins).padStart(2, "0")}min`;
}

export async function GET(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);

    const url = new URL(request.url);
    const employeeId = url.searchParams.get("employeeId");
    const mes = url.searchParams.get("mes") || currentMonth();

    const filtroEmployeeId = actor.role === "SERVIDOR" 
      ? actor.employeeId 
      : (employeeId ? Number(employeeId) : null);

    if (!filtroEmployeeId) {
      throw new ApiError("employeeId não informado.", 400);
    }

    const inicioMes = `${mes}-01`;
    const fimMes = monthEnd(mes);

    try {
      const [movimentacoes, solicitacoes, config, servidor] = await Promise.all([
        db
          .select({
            id: bancoHoras.id,
            data: bancoHoras.data,
            tipo: bancoHoras.tipo,
            minutos: bancoHoras.minutos,
            saldoAcumulado: bancoHoras.saldoAcumulado,
            descricao: bancoHoras.descricao,
            aprovadoEm: bancoHoras.aprovadoEm,
          })
          .from(bancoHoras)
          .where(
            and(
              eq(bancoHoras.employeeId, filtroEmployeeId),
              gte(bancoHoras.data, inicioMes),
              lte(bancoHoras.data, fimMes),
            ),
          )
          .orderBy(desc(bancoHoras.data)),
        db
          .select({
            id: bancoHorasSolicitacoes.id,
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
          .where(eq(bancoHorasSolicitacoes.employeeId, filtroEmployeeId))
          .orderBy(desc(bancoHorasSolicitacoes.dataSolicitacao)),
        db.select().from(bancoHorasConfig).limit(1),
        db
          .select({ id: employees.id, nome: employees.nome, matricula: employees.matricula })
          .from(employees)
          .where(eq(employees.id, filtroEmployeeId))
          .limit(1),
      ]);

      const saldoAtual = movimentacoes.reduce((acc, mov) => acc + mov.minutos, 0);
      const cfg = config[0];

      return ok({
        servidor: servidor,
        mes,
        saldoAtual,
        saldoFormatado: formatarHoras(saldoAtual),
        configuracoes: cfg ? {
          validadeMeses: cfg.validadeMeses,
          limiteUsoDia: formatarHoras(cfg.limiteUsoDiaMin),
          limiteUsoMes: formatarHoras(cfg.limiteUsoMesMin),
          saldoNegativoPermitido: cfg.saldoNegativoPermitido,
          saldoMinimo: formatarHoras(cfg.saldoMinimoNegativoMin),
        } : null,
        movimentacoes,
        solicitacoes,
        podeSolicitar: actor.role === "SERVIDOR",
        podeAprovar: actor.role === "GESTOR",
      });
    } catch (e) {
      // Tabela banco_horas não existe - retornar vazio
      const [servidor] = await db
        .select({ id: employees.id, nome: employees.nome, matricula: employees.matricula })
        .from(employees)
        .where(eq(employees.id, filtroEmployeeId))
        .limit(1);

      return ok({
        servidor: servidor,
        mes,
        saldoAtual: 0,
        saldoFormatado: "0h00min",
        configuracoes: null,
        movimentacoes: [],
        solicitacoes: [],
        podeSolicitar: actor.role === "SERVIDOR",
        podeAprovar: actor.role === "GESTOR",
      });
    }
  });
}
