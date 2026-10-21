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
      servidor: servidor[0],
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
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "SERVIDOR") throw new ApiError("Acesso restrito ao servidor.", 403);
    if (!actor.employeeId) throw new ApiError("Servidor não vinculado.", 400);

    const body = await readJson(request);
    const tipo = reqString(body, "tipo", "o tipo", { max: 20 });
    const minutos = reqInt(body, "minutos", "os minutos", { min: 1, max: 480 }) || 0;
    const dataUso = reqString(body, "dataUso", "a data de uso", { required: false, max: 10 });
    
    // Validar data de uso para DÉBITO e COMPENSAÇÃO
    if ((tipo === "DEBITO" || tipo === "COMPENSACAO") && !dataUso) {
      throw new ApiError("Data de uso é obrigatória para débito ou compensação.", 400);
    }
    
    // Validar se data não é passada
    if (dataUso && dataUso < new Date().toISOString().slice(0, 10)) {
      throw new ApiError("Data de uso não pode ser no passado.", 400);
    }
    const motivo = reqString(body, "motivo", "o motivo", { max: 500 });

    if (!["EXTRA", "DEBITO", "COMPENSACAO"].includes(tipo)) {
      throw new ApiError("Tipo inválido.", 400);
    }

    const [config, saldoAtual] = await Promise.all([
      db.select().from(bancoHorasConfig).limit(1),
      db
        .select({ total: sql<number>`COALESCE(SUM(minutos), 0)::int` })
        .from(bancoHoras)
        .where(eq(bancoHoras.employeeId, actor.employeeId)),
    ]);

    const saldo = Number(saldoAtual[0]?.total ?? 0);
    const cfg = config[0];

    if (tipo === "DEBITO" && cfg && minutos) {
      if (!cfg.saldoNegativoPermitido && saldo < minutos) {
        throw new ApiError(`Saldo insuficiente. Você tem ${formatarHoras(saldo)} disponíveis.`, 400);
      }
      if (cfg.saldoNegativoPermitido && cfg.saldoMinimoNegativoMin && saldo - minutos < cfg.saldoMinimoNegativoMin) {
        throw new ApiError(`Limite de saldo negativo atingido. Mínimo: ${formatarHoras(cfg.saldoMinimoNegativoMin)}.`, 400);
      }
      if (minutos && minutos > cfg.limiteUsoDiaMin) {
        throw new ApiError(`Limite diário excedido. Máximo: ${formatarHoras(cfg.limiteUsoDiaMin)}.`, 400);
      }
    }

    const [solicitacao] = await db
      .insert(bancoHorasSolicitacoes)
      .values({
        employeeId: actor.employeeId,
        tipo: tipo as any,
        minutos,
        dataSolicitacao: new Date().toISOString().slice(0, 10),
        dataUso: dataUso || null,
        motivo,
        status: "PENDENTE",
        solicitadoPorUserId: actor.id,
      })
      .returning();

    await logAudit({
      actor,
      action: "SOLICITAR_BANCO_HORAS",
      entity: "banco_horas_solicitacoes",
      entityId: solicitacao.id,
      details: { tipo, minutos, motivo },
    });

    return ok({ solicitacao }, 201);
  });
}
