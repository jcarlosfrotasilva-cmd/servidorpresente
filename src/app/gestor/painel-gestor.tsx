"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/icons";
import { useToast } from "@/components/toast";
import { Avatar, Badge, Card, EmptyState, SectionTitle, StatCard, TableWrap } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  ENTRY_LABELS,
  ENTRY_SHORT,
  formatDateBR,
  formatDuration,
  formatSigned,
  weekdayLabel,
  type EntryType,
} from "@/lib/time";

type Dashboard = {
  hoje: string;
  kpis: {
    servidoresAtivos: number;
    pendentes: number;
    registrosHoje: number;
    registrosMes: number;
    emExpediente: number;
    emIntervalo: number;
    ausentes: number;
    atrasos: number;
    encerrados: number;
    folga: number;
    previstoHoje: number;
    trabalhadoHoje: number;
  };
  panel: {
    id: number;
    nome: string;
    cargo: string;
    matricula: string;
    modeloNome: string | null;
    horarioHoje: string;
    trabalhaHoje: boolean;
    previsto: number;
    batidas: number;
    ultima: string | null;
    trabalhado: number;
    atraso: boolean;
    status: "EXPEDIENTE" | "INTERVALO" | "ENCERRADO" | "AUSENTE" | "FOLGA";
  }[];
  ultimosRegistros: {
    id: number;
    employeeNome: string;
    tipo: EntryType;
    hora: string;
    data: string;
    origin: "SERVIDOR" | "GESTOR" | "RETIFICACAO";
  }[];
  solicitacoesRecentes: {
    id: number;
    employeeNome: string;
    data: string;
    tipo: EntryType;
    horaSolicitada: string;
    status: "PENDENTE" | "APROVADA" | "REJEITADA";
    createdAt: string;
  }[];
  serie: { data: string; total: number }[];
  auditoria: {
    id: number;
    actorNome: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    createdAt: string;
  }[];
};

const STATUS_META = {
  EXPEDIENTE: { tone: "success" as const, label: "Em expediente" },
  INTERVALO: { tone: "warning" as const, label: "Intervalo" },
  ENCERRADO: { tone: "brand" as const, label: "Encerrado" },
  AUSENTE: { tone: "danger" as const, label: "Sem batida" },
  FOLGA: { tone: "neutral" as const, label: "Sem expediente" },
};

const ACAO_LABEL: Record<string, string> = {
  LOGIN: "Acesso ao sistema",
  CRIAR_SERVIDOR: "Cadastro de servidor",
  ATUALIZAR_SERVIDOR: "Edição de servidor",
  EXCLUIR_SERVIDOR: "Exclusão de servidor",
  CRIAR_JORNADA: "Nova jornada",
  ATUALIZAR_JORNADA: "Edição de jornada",
  EXCLUIR_JORNADA: "Exclusão de jornada",
  CRIAR_REGISTRO: "Lançamento de ponto",
  ATUALIZAR_REGISTRO: "Alteração de ponto",
  EXCLUIR_REGISTRO: "Exclusão de ponto",
  REGISTRAR_PONTO: "Marcação do servidor",
  APROVAR_RETIFICACAO: "Retificação aprovada",
  REJEITAR_RETIFICACAO: "Retificação rejeitada",
  SOLICITAR_RETIFICACAO: "Solicitação de retificação",
  ALTERAR_SENHA: "Alteração de senha",
};

export function PainelGestor({ nome }: { nome: string }) {
  const toast = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const payload = await apiFetch<Dashboard>("/api/gestor/dashboard");
      setData(payload);
    } catch (error) {
      toast.error("Falha ao carregar indicadores", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => void carregar(), 60000);
    return () => window.clearInterval(id);
  }, [carregar]);

  const maiorSerie = Math.max(1, ...(data?.serie.map((item) => item.total) ?? [1]));

  return (
    <div className="space-y-6">
      <SectionTitle
        title={`Visão geral da unidade escolar`}
        description={`${nome} · acompanhamento em tempo real da frequência dos servidores`}
        action={
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/gestor/conferencia"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
            >
              <CheckIcon className="h-4 w-4" /> Conferência de frequência
            </Link>
            <Link
              href="/gestor/retificacoes"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
            >
              <AlertIcon className="h-4 w-4" /> Retificações
              {data && data.kpis.pendentes > 0 ? (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                  {data.kpis.pendentes}
                </span>
              ) : null}
            </Link>
            <Link
              href="/gestor/servidores"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-brand-500"
            >
              <UsersIcon className="h-4 w-4" /> Cadastrar servidor
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Servidores ativos"
          value={data?.kpis.servidoresAtivos ?? "--"}
          hint={`${data?.kpis.emExpediente ?? 0} em expediente · ${data?.kpis.emIntervalo ?? 0} em intervalo`}
          icon={<UsersIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Marcações hoje"
          value={data?.kpis.registrosHoje ?? "--"}
          hint={`${data?.kpis.encerrados ?? 0} encerradas · ${data?.kpis.folga ?? 0} sem expediente`}
          tone="info"
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Atrasos hoje"
          value={data?.kpis.atrasos ?? "--"}
          hint="Entrada após a tolerância da jornada"
          tone={(data?.kpis.atrasos ?? 0) > 0 ? "warning" : "success"}
          icon={<AlertIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Retificações pendentes"
          value={data?.kpis.pendentes ?? "--"}
          hint="Aguardando parecer da gestão"
          tone={(data?.kpis.pendentes ?? 0) > 0 ? "danger" : "success"}
          icon={<ShieldIcon className="h-[18px] w-[18px]" />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="card-header">
            <div>
              <p className="text-sm font-bold text-slate-800">Painel do dia</p>
              <p className="text-xs text-slate-500">
                Situação atual de cada servidor · atualização automática
              </p>
            </div>
            <Badge tone="brand">{data ? formatDateBR(data.hoje) : "--"}</Badge>
          </div>
          {carregando ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : !data || data.panel.length === 0 ? (
            <EmptyState
              title="Nenhum servidor ativo"
              description="Cadastre os servidores da unidade para acompanhar a frequência."
              icon={<UsersIcon className="h-6 w-6" />}
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>Servidor</th>
                  <th>Horário de hoje</th>
                  <th>Última batida</th>
                  <th>Apurado</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {data.panel.map((row) => {
                  const meta = STATUS_META[row.status];
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar nome={row.nome} />
                          <div>
                            <p className="text-[13px] font-bold text-slate-800">{row.nome}</p>
                            <p className="text-[11px] text-slate-500">
                              {row.cargo} · {row.matricula}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="text-[12px] text-slate-600">
                        <p className={row.trabalhaHoje ? "font-semibold text-slate-700" : "text-slate-400"}>
                          {row.horarioHoje}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {row.modeloNome ? `modelo ${row.modeloNome}` : "horário individual"}
                        </p>
                      </td>
                      <td>
                        <span className="font-mono text-[13px] font-bold tabular-nums text-slate-700">
                          {row.ultima ? row.ultima.slice(0, 5) : "--:--"}
                        </span>
                        <span className="ml-2 text-[11px] text-slate-400">
                          {row.batidas} batida(s)
                        </span>
                      </td>
                      <td className="font-semibold text-slate-700">
                        {formatDuration(row.trabalhado)}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {row.atraso ? <Badge tone="warning">Atraso</Badge> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Marcações nos últimos 7 dias</p>
                <p className="text-xs text-slate-500">Total de batidas registradas por dia</p>
              </div>
              <Badge tone="info">{data?.kpis.registrosMes ?? 0} no mês</Badge>
            </div>
            <div className="mt-6 flex h-40 items-end gap-2.5">
              {(data?.serie ?? []).map((item) => (
                <div key={item.data} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500">{item.total}</span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-accent-400 transition-all duration-700"
                    style={{ height: `${Math.max((item.total / maiorSerie) * 100, 4)}%` }}
                  />
                  <span className="text-[10px] font-semibold uppercase text-slate-400">
                    {weekdayLabel(new Date(`${item.data}T12:00:00Z`).getUTCDay() || 7)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <p className="text-sm font-bold text-slate-800">Últimas marcações</p>
              <Link
                href="/gestor/registros"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:underline"
              >
                Ver todas <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {(data?.ultimosRegistros ?? []).map((registro) => (
                <li key={registro.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">
                      {registro.employeeNome}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {ENTRY_SHORT[registro.tipo]} · {formatDateBR(registro.data)}
                      {registro.origin !== "SERVIDOR" ? " · ajuste da gestão" : ""}
                    </p>
                  </div>
                  <span className="font-mono text-[13px] font-bold tabular-nums text-slate-700">
                    {registro.hora.slice(0, 5)}
                  </span>
                </li>
              ))}
              {!carregando && (data?.ultimosRegistros ?? []).length === 0 ? (
                <li className="px-5 py-6 text-center text-[13px] text-slate-500">
                  Nenhuma marcação registrada ainda.
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <div className="card-header">
            <p className="text-sm font-bold text-slate-800">Retificações recentes</p>
            <Link
              href="/gestor/retificacoes"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 hover:underline"
            >
              Analisar <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
          {(data?.solicitacoesRecentes ?? []).length === 0 ? (
            <EmptyState
              title="Nenhuma solicitação registrada"
              description="As solicitações enviadas pelos servidores aparecerão aqui."
              icon={<CheckIcon className="h-6 w-6" />}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data?.solicitacoesRecentes.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800">
                      {item.employeeNome}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {ENTRY_LABELS[item.tipo]} de {formatDateBR(item.data)} →{" "}
                      <span className="font-mono font-bold text-brand-700">
                        {item.horaSolicitada.slice(0, 5)}
                      </span>
                    </p>
                  </div>
                  <Badge
                    tone={
                      item.status === "PENDENTE"
                        ? "warning"
                        : item.status === "APROVADA"
                          ? "success"
                          : "danger"
                    }
                  >
                    {item.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="card-header">
            <p className="text-sm font-bold text-slate-800">Trilha de auditoria</p>
            <Badge tone="neutral">{data?.auditoria.length ?? 0} eventos</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {(data?.auditoria ?? []).map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                  <ShieldIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">
                    {ACAO_LABEL[item.action] ?? item.action}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {item.actorNome ?? "Sistema"} ·{" "}
                    {new Date(item.createdAt).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </li>
            ))}
            {!carregando && (data?.auditoria ?? []).length === 0 ? (
              <li className="px-5 py-6 text-center text-[13px] text-slate-500">
                Nenhuma ação registrada.
              </li>
            ) : null}
          </ul>
        </Card>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-brand-900 to-brand-700 p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
            <CalendarIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold">Saldo consolidado do mês</p>
            <p className="text-[12px] text-brand-100/80">
              Diferença entre horas trabalhadas e horas previstas das jornadas ativas
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-black">
            {formatDuration(data?.kpis.trabalhadoHoje ?? 0)}
          </p>
          <p className="text-[11px] text-brand-100/80">
            apurado hoje · previsto {formatDuration(data?.kpis.previstoHoje ?? 0)}
          </p>
        </div>
      </Card>
    </div>
  );
}
