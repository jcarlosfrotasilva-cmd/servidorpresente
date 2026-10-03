import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { employees, livroPontoFechamentos, workSchedules } from "@/db/schema";
import {
  LEGENDA_POR_ARQUIVO,
  LEGENDA_POR_FERIADO,
  MESES_EXTENSO,
  categoriaLabel,
  protocoloLivroPonto,
} from "@/lib/livro-ponto-types";
import { buildEmployeeWeeks, buildMonthlyReport, type DayReportRow } from "@/lib/reports";
import { weekSummary } from "@/lib/schedule";
import { monthLabel, weekdayLabel } from "@/lib/time";

export type LivroPontoDia = {
  data: string;
  dia: string;
  diaSemana: string;
  entrada: string;
  saidaAlmoco: string;
  retornoAlmoco: string;
  saidaExpediente: string;
  horasCumpridas: number;
  horasPrevistas: number;
  saldo: number;
  codigos: string[];
  ocorrencia: string;
  observacao: string;
  naoUtil: boolean;
  feriadoNome: string | null;
  feriadoTipo: string | null;
  feriadoBloqueia: boolean;
  foraDoHorario: boolean;
  atraso: boolean;
  incompleto: boolean;
  falta: boolean;
  ausenciaIntegral: boolean;
  ausenciaLabel: string | null;
  futuro: boolean;
};

export type LivroPontoOficial = {
  jornadaHoras: string;
  regimePlantao: "Sim" | "Não";
  horarioTrabalho: string;
  intervaloAlmoco: string;
  horarioEstudante: "Sim" | "Não";
  mesAno: string;
  financeiro: {
    feriasDe: string | null;
    feriasAte: string | null;
    mediaGtn: string | null;
    acaDe: string | null;
    acaAte: string | null;
    acaQuantidade: string | null;
    gtnDe: string | null;
    gtnAte: string | null;
    servicoExtraDe: string | null;
    servicoExtraAte: string | null;
    servicoExtraQuantidade: number;
    substituicaoPeriodo: string | null;
    cargoSubstituido: string | null;
  };
};

export type LivroPontoDocumento = {
  mes: string;
  mesLabel: string;
  competencia: string;
  protocolo: string;
  identificacao: {
    nome: string;
    matricula: string;
    rg: string;
    cpf: string;
    cargo: string;
    categoria: string;
    vinculo: string;
    admissao: string | null;
    horarioEstudante: boolean;
    unidade: string;
    jornadaResumo: string;
    intervaloResumo: string;
    cargaDiaria: string;
    cargaSemanal: string;
    diasSemana: string[];
  };
  dias: LivroPontoDia[];
  totais: {
    diasTrabalhados: number;
    diasFaltas: number;
    diasAusencia: number;
    diasFeriado: number;
    diasExtra: number;
    atrasos: number;
    incompletos: number;
    totalMinutos: number;
    esperadoMinutos: number;
    saldoMinutos: number;
  };
  oficial: LivroPontoOficial;
  fechamento: {
    id: number;
    protocolo: string;
    fechadoPorNome: string | null;
    fechadoEm: string;
    ocorrencias: string | null;
    totalMinutos: number;
    diasFalta: number;
  } | null;
  diasFechados: string[];
};

function hhmm(value?: string | null): string {
  return value ? value.slice(0, 5) : "";
}

function codesForDay(dia: DayReportRow): { codigos: string[]; ocorrencia: string; observacao: string } {
  const codigos: string[] = [];
  const textos: string[] = [];

  if (dia.feriado) {
    const legenda = LEGENDA_POR_FERIADO[dia.feriado.tipo];
    if (legenda) {
      const aplicavel = dia.feriado.bloqueiaPonto || dia.entries.length === 0;
      if (aplicavel) {
        codigos.push(legenda.codigo);
        textos.push(dia.feriado.nome);
      }
    }
  }

  for (const ausencia of dia.ausencias) {
    const legenda = LEGENDA_POR_ARQUIVO[ausencia.tipo];
    const codigo = legenda?.codigo ?? "OB";
    const faixa = ausencia.diaInteiro
      ? ""
      : ` (${ausencia.horaInicio ?? "--"}–${ausencia.horaFim ?? "--"})`;
    codigos.push(`${codigo}${faixa}`);
    textos.push(`${legenda?.descricao ?? "Ausência registrada"}${faixa}`);
  }

  if (dia.falta) {
    codigos.push("FI");
    textos.push("Falta injustificada — sem registro de ponto");
  }

  if (dia.atraso) {
    codigos.push("A");
    textos.push("Atraso na entrada (fora da tolerância)");
  }

  if (dia.futuro) {
    textos.push("Lançamento programado — data posterior à emissão do documento");
  }

  if (dia.incompleto) {
    textos.push("Batidas incompletas no dia");
  }

  if (dia.diaNaoUtil && dia.entries.length > 0) {
    if (dia.ausenciaDiaInteiro) {
      // Ausência integral prevalece: as batidas do dia não geram horas extras.
      textos.push(
        "Registros de ponto lançados neste dia devem ser desconsiderados — ausência integral registrada pela direção",
      );
    } else {
      codigos.push("HE");
      textos.push("Serviço extraordinário em dia não útil");
    }
  } else if (!dia.diaNaoUtil && dia.saldo > 0) {
    codigos.push("S");
  } else if (!dia.diaNaoUtil && dia.saldo < 0) {
    codigos.push("-");
  }

  const porTipo = new Map<string, string>();
  for (const entry of dia.entries) porTipo.set(entry.tipo, entry.hora.slice(0, 5));
  const observacaoExtra = dia.entries.length > 0 && dia.entries.length !== dia.esperadas.length
    ? `Batidas registradas: ${dia.entries.map((e) => e.hora.slice(0, 5)).join(" / ")}`
    : "";

  return {
    codigos,
    ocorrencia: textos.join("; "),
    observacao: observacaoExtra,
  };
}

export async function buildLivroPonto(
  employeeId: number,
  mes: string,
): Promise<LivroPontoDocumento | null> {
  const [servidor] = await db
    .select({
      id: employees.id,
      nome: employees.nome,
      matricula: employees.matricula,
      rg: employees.rg,
      cpf: employees.cpf,
      cargo: employees.cargo,
      categoria: employees.categoria,
      vinculo: employees.vinculo,
      admissao: employees.dataAdmissao,
      horarioEstudante: employees.horarioEstudante,
      jornadaId: employees.jornadaId,
      modeloNome: workSchedules.nome,
    })
    .from(employees)
    .leftJoin(workSchedules, eq(employees.jornadaId, workSchedules.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!servidor) return null;

  // O Livro Ponto cobre a competência inteira: feriados e ausências já cadastrados
  // em datas futuras também constam no documento.
  const report = await buildMonthlyReport(mes, [employeeId], { incluirFuturos: true });
  const linha = report.rows[0];

  const weeks = await buildEmployeeWeeks([employeeId]);
  const week = weeks.get(employeeId) ?? new Map();
  const resumoSemana = weekSummary(week);
  const primeiroDia = week.values().next().value;

  const [fechamento] = await db
    .select()
    .from(livroPontoFechamentos)
    .where(
      and(eq(livroPontoFechamentos.employeeId, employeeId), eq(livroPontoFechamentos.mes, mes)),
    )
    .limit(1);

  const dias: LivroPontoDia[] = (linha?.dias ?? [])
    .slice()
    .sort((a, b) => (a.data < b.data ? -1 : 1))
    .map((dia) => {
      const porTipo = new Map<string, string>();
      dia.entries.forEach((entry) => porTipo.set(entry.tipo, entry.hora.slice(0, 5)));
      const { codigos, ocorrencia, observacao } = codesForDay(dia);
      return {
        data: dia.data,
        dia: dia.data.slice(8, 10),
        diaSemana: weekdayLabel(dia.weekday),
        entrada: porTipo.get("ENTRADA") ?? "",
        saidaAlmoco: porTipo.get("SAIDA_ALMOCO") ?? "",
        retornoAlmoco: porTipo.get("RETORNO_ALMOCO") ?? "",
        saidaExpediente: porTipo.get("SAIDA_EXPEDIENTE") ?? "",
        // Ausência integral: as batidas do dia são desconsideradas (não geram horas no documento).
        horasCumpridas: dia.ausenciaDiaInteiro ? 0 : dia.workedMinutes,
        horasPrevistas: dia.expectedMinutes,
        saldo: dia.saldo,
        codigos,
        ocorrencia,
        observacao,
        naoUtil: dia.diaNaoUtil,
        feriadoNome: dia.feriado?.nome ?? null,
        feriadoTipo: dia.feriado?.tipo ?? null,
        feriadoBloqueia: Boolean(dia.feriado?.bloqueiaPonto),
        foraDoHorario: dia.folga,
        atraso: dia.atraso,
        incompleto: dia.incompleto,
        falta: dia.falta,
        ausenciaIntegral: dia.ausenciaDiaInteiro,
        ausenciaLabel: dia.ausenciaDiaInteiro
          ? (dia.ausencias.find((ausencia) => ausencia.diaInteiro)?.label ?? "Ausência")
          : null,
        futuro: dia.futuro,
      };
    });

  const esperadoMinutos = linha?.esperadoMinutos ?? 0;

  // --- Campos do formulário oficial (REGISTRO DE PONTO — SEE-SP) ---
  const padraoPorDia = new Map<string, string[]>();
  week.forEach((day, iso) => {
    if (!day.trabalha || !day.entrada || !day.saidaExpediente) return;
    const chave = `${day.entrada.slice(0, 5)}–${day.saidaExpediente.slice(0, 5)}`;
    const lista = padraoPorDia.get(chave) ?? [];
    lista.push(weekdayLabel(iso));
    padraoPorDia.set(chave, lista);
  });
  const horarioTrabalho =
    Array.from(padraoPorDia.entries())
      .map(([faixa, nomes]) => `${faixa} (${nomes.join(", ")})`)
      .join(" · ") || "A definir pela direção";

  const comIntervalo = Array.from(week.values()).find(
    (day) => day.trabalha && day.saidaAlmoco && day.retornoAlmoco,
  );
  const intervaloAlmoco = comIntervalo
    ? `${hhmm(comIntervalo.saidaAlmoco)} às ${hhmm(comIntervalo.retornoAlmoco)} (nos dias com intervalo)`
    : "Não há intervalo previsto";

  const diasFerias = dias.filter((dia) =>
    (linha?.dias ?? []).some(
      (original) =>
        original.data === dia.data &&
        original.ausencias.some((ausencia) => ausencia.tipo === "FERIAS"),
    ),
  );
  const diasExtraLista = dias.filter((dia) => dia.codigos.some((c) => c.startsWith("HE")));

  const oficial: LivroPontoOficial = {
    jornadaHoras: `${(resumoSemana.minutos / 60).toFixed(2).replace(".", ",")} Horas semanais`,
    regimePlantao: "Não",
    horarioTrabalho,
    intervaloAlmoco,
    horarioEstudante: servidor.horarioEstudante ? "Sim" : "Não",
    mesAno: `${MESES_EXTENSO[Number(mes.slice(5, 7)) - 1]?.toUpperCase()} DE ${mes.slice(0, 4)}`,
    financeiro: {
      feriasDe: diasFerias[0]?.data ?? null,
      feriasAte: diasFerias[diasFerias.length - 1]?.data ?? null,
      mediaGtn: null,
      acaDe: null,
      acaAte: null,
      acaQuantidade: null,
      gtnDe: null,
      gtnAte: null,
      servicoExtraDe: diasExtraLista[0]?.data ?? null,
      servicoExtraAte: diasExtraLista[diasExtraLista.length - 1]?.data ?? null,
      servicoExtraQuantidade: diasExtraLista.length,
      substituicaoPeriodo: null,
      cargoSubstituido: null,
    },
  };

  // Totais do documento: apurados a partir dos dias considerados válidos.
  const totalMinutos = dias.reduce((acc, dia) => acc + dia.horasCumpridas, 0);

  return {
    mes,
    mesLabel: monthLabel(mes),
    competencia: `${String(mes.slice(5, 7)).padStart(2, "0")}/${mes.slice(0, 4)}`,
    protocolo: protocoloLivroPonto(employeeId, mes, totalMinutos),
    identificacao: {
      nome: servidor.nome,
      matricula: servidor.matricula,
      rg: servidor.rg ?? "Não informado",
      cpf: servidor.cpf ?? "Não informado",
      cargo: servidor.cargo,
      categoria: categoriaLabel(servidor.categoria),
      vinculo: servidor.vinculo,
      admissao: servidor.admissao,
      horarioEstudante: servidor.horarioEstudante,
      unidade: servidor.modeloNome ?? "Horário individual definido pela direção",
      jornadaResumo:
        resumoSemana.dias > 0
          ? `${resumoSemana.dias} dia(s) por semana`
          : "Sem jornada definida",
      intervaloResumo: primeiroDia?.saidaAlmoco && primeiroDia?.retornoAlmoco
        ? `Almoço/descanso previsto — intervalos registrados diariamente`
        : "Jornada sem intervalo previsto",
      cargaDiaria: `${(Math.round(resumoSemana.minutos / Math.max(resumoSemana.dias, 1)) / 60)
        .toFixed(2)
        .replace(".", ",")} h (média diária)`,
      cargaSemanal: `${(resumoSemana.minutos / 60).toFixed(2).replace(".", ",")} h semanais`,
      diasSemana: resumoSemana.diasUteis.map((iso) => weekdayLabel(iso)),
    },
    dias,
    oficial,
    totais: {
      diasTrabalhados: linha?.diasTrabalhados ?? 0,
      diasFaltas: linha?.diasFalta ?? 0,
      diasAusencia: linha?.diasAusencia ?? 0,
      diasFeriado: linha?.diasFeriado ?? 0,
      diasExtra: linha?.diasExtra ?? 0,
      atrasos: linha?.atrasos ?? 0,
      incompletos: linha?.diasIncompletos ?? 0,
      totalMinutos,
      esperadoMinutos,
      saldoMinutos: totalMinutos - esperadoMinutos,
    },
    fechamento: fechamento
      ? {
          id: fechamento.id,
          protocolo: fechamento.protocolo,
          fechadoPorNome: fechamento.fechadoPorNome,
          fechadoEm: fechamento.fechadoEm.toISOString(),
          ocorrencias: fechamento.ocorrencias,
          totalMinutos: fechamento.totalMinutos,
          diasFalta: fechamento.diasFalta,
        }
      : null,
    diasFechados: fechamento ? [fechamento.mes] : [],
  };
}

export type LivroPontoResumo = {
  employeeId: number;
  nome: string;
  matricula: string;
  cargo: string;
  categoria: string;
  modeloNome: string | null;
  totalMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
  diasTrabalhados: number;
  diasFaltas: number;
  diasAusencia: number;
  diasFeriado: number;
  atrasos: number;
  fechadoEm: string | null;
  fechadoPorNome: string | null;
  protocolo: string | null;
};

export async function listLivroPonto(
  mes: string,
  employeeIds?: number[],
): Promise<(LivroPontoResumo & { dias: number })[]> {
  const report = await buildMonthlyReport(mes, employeeIds);
  const ids = report.rows.map((row) => row.employeeId);
  if (ids.length === 0) return [];

  // Consultas em paralelo (menos round-trips = menos risco de timeout em serverless).
  const [fechamentos, base] = await Promise.all([
    db
      .select({
        employeeId: livroPontoFechamentos.employeeId,
        mes: livroPontoFechamentos.mes,
        protocolo: livroPontoFechamentos.protocolo,
        fechadoPorNome: livroPontoFechamentos.fechadoPorNome,
        fechadoEm: livroPontoFechamentos.fechadoEm,
      })
      .from(livroPontoFechamentos)
      .where(
        and(inArray(livroPontoFechamentos.employeeId, ids), eq(livroPontoFechamentos.mes, mes)),
      )
      .catch((error) => {
        console.error("[livro-ponto] falha ao ler fechamentos:", error);
        return [] as {
          employeeId: number;
          mes: string;
          protocolo: string;
          fechadoPorNome: string | null;
          fechadoEm: Date;
        }[];
      }),
    db
      .select({
        id: employees.id,
        nome: employees.nome,
        matricula: employees.matricula,
        cargo: employees.cargo,
        categoria: employees.categoria,
        modeloNome: workSchedules.nome,
      })
      .from(employees)
      .leftJoin(workSchedules, eq(employees.jornadaId, workSchedules.id))
      .where(inArray(employees.id, ids)),
  ]);

  const porServidor = new Map(fechamentos.map((item) => [item.employeeId, item]));
  const dados = new Map(base.map((item) => [item.id, item]));

  return report.rows
    .map((row) => {
      const fechamento = porServidor.get(row.employeeId);
      const servidor = dados.get(row.employeeId);
      return {
        employeeId: row.employeeId,
        nome: row.nome,
        matricula: row.matricula,
        cargo: row.cargo,
        categoria: servidor?.categoria ?? "EFETIVO",
        modeloNome: servidor?.modeloNome ?? null,
        totalMinutos: row.totalMinutos,
        esperadoMinutos: row.esperadoMinutos,
        saldoMinutos: row.saldoMinutos,
        diasTrabalhados: row.diasTrabalhados,
        diasFaltas: row.diasFalta,
        diasAusencia: row.diasAusencia,
        diasFeriado: row.diasFeriado,
        atrasos: row.atrasos,
        fechadoEm: fechamento?.fechadoEm.toISOString() ?? null,
        fechadoPorNome: fechamento?.fechadoPorNome ?? null,
        protocolo: fechamento?.protocolo ?? null,
        dias: row.dias.length,
      };
    })
    .sort((a, b) => (a.fechadoEm === b.fechadoEm ? a.nome.localeCompare(b.nome) : a.fechadoEm ? 1 : -1));
}

export async function findFechamento(employeeId: number, mes: string) {
  const [row] = await db
    .select()
    .from(livroPontoFechamentos)
    .where(
      and(eq(livroPontoFechamentos.employeeId, employeeId), eq(livroPontoFechamentos.mes, mes)),
    )
    .limit(1);
  return row ?? null;
}
