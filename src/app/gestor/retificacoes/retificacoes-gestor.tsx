"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  ShieldIcon,
  TrashIcon,
} from "@/components/icons";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  Select,
  Textarea,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  ENTRY_LABELS,
  formatDateBR,
  formatDateLong,
  formatDateTimeBR,
  type EntryType,
} from "@/lib/time";

type Solicitacao = {
  id: number;
  employeeId: number;
  employeeNome: string;
  matricula: string;
  cargo: string;
  data: string;
  tipo: EntryType;
  horaSolicitada: string;
  motivo: string;
  status: "PENDENTE" | "APROVADA" | "REJEITADA";
  parecer: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

type Registro = {
  id: number;
  employeeId: number;
  data: string;
  tipo: EntryType;
  hora: string;
  origin: string;
};

export function RetificacoesGestor({ mesInicial }: { mesInicial: string }) {
  const toast = useToast();
  const [filtro, setFiltro] = useState<"PENDENTE" | "APROVADA" | "REJEITADA" | "todos">("PENDENTE");
  const [mes, setMes] = useState(mesInicial);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [decisao, setDecisao] = useState<{ solicitacao: Solicitacao; aprovar: boolean } | null>(null);
  const [parecer, setParecer] = useState("");
  const [processando, setProcessando] = useState(false);
  const [excluir, setExcluir] = useState<Solicitacao | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await apiFetch<{ solicitacoes: Solicitacao[]; registros: Registro[] }>(
        `/api/retificacoes?status=${filtro}&mes=${mes}`,
      );
      setSolicitacoes(data.solicitacoes);
      setRegistros(data.registros);
    } catch (error) {
      toast.error("Falha ao carregar retificações", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtro, mes, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const contagem = useMemo(
    () => ({
      pendentes: solicitacoes.filter((item) => item.status === "PENDENTE").length,
      aprovadas: solicitacoes.filter((item) => item.status === "APROVADA").length,
      rejeitadas: solicitacoes.filter((item) => item.status === "REJEITADA").length,
    }),
    [solicitacoes],
  );

  const registroAtual = (solicitacao: Solicitacao) =>
    registros.find(
      (registro) =>
        registro.employeeId === solicitacao.employeeId &&
        registro.data === solicitacao.data &&
        registro.tipo === solicitacao.tipo,
    );

  const confirmar = async () => {
    if (!decisao) return;
    if (!decisao.aprovar && parecer.trim().length < 5) {
      toast.error("Informe o parecer", "A rejeição exige justificativa com no mínimo 5 caracteres.");
      return;
    }
    setProcessando(true);
    try {
      await apiFetch(`/api/retificacoes/${decisao.solicitacao.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          decisao: decisao.aprovar ? "APROVADA" : "REJEITADA",
          parecer: parecer,
        }),
      });
      toast.success(
        decisao.aprovar ? "Retificação aprovada" : "Retificação rejeitada",
        decisao.aprovar
          ? "O registro de ponto foi atualizado e a alteração consta na auditoria."
          : "O servidor será informado pelo parecer registrado.",
      );
      setDecisao(null);
      setParecer("");
      void carregar();
    } catch (error) {
      toast.error("Não foi possível concluir", (error as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluir) return;
    setProcessando(true);
    try {
      await apiFetch(`/api/retificacoes/${excluir.id}`, { method: "DELETE" });
      toast.success("Solicitação removida");
      setExcluir(null);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível remover", (error as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Retificações de horários registrados indevidamente"
        description="Analise as solicitações dos servidores e defina o parecer da gestão escolar."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              type="month"
              value={mes}
              onChange={(event) => setMes(event.target.value || mesInicial)}
              className="w-[160px]"
            />
            <Select
              value={filtro}
              onChange={(event) => setFiltro(event.target.value as typeof filtro)}
              className="w-[190px]"
            >
              <option value="PENDENTE">Somente pendentes</option>
              <option value="APROVADA">Somente aprovadas</option>
              <option value="REJEITADA">Somente rejeitadas</option>
              <option value="todos">Todas as solicitações</option>
            </Select>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Pendentes de análise", value: contagem.pendentes, tone: "warning" as const, status: "PENDENTE" as const },
          { label: "Aprovadas", value: contagem.aprovadas, tone: "success" as const, status: "APROVADA" as const },
          { label: "Rejeitadas", value: contagem.rejeitadas, tone: "danger" as const, status: "REJEITADA" as const },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setFiltro(item.status)}
            className={`card p-5 text-left transition ${
              filtro === item.status ? "ring-2 ring-brand-500/40" : "hover:border-brand-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {item.label}
              </p>
              <Badge tone={item.tone}>{item.value}</Badge>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {filtro === item.status ? "Filtro aplicado" : "Clique para filtrar"}
            </p>
          </button>
        ))}
      </div>

      <Card>
        <div className="card-header">
          <div>
            <p className="text-sm font-bold text-slate-800">Fila de análise</p>
            <p className="text-xs text-slate-500">
              A aprovação atualiza automaticamente o espelho de ponto do servidor.
            </p>
          </div>
          <Badge tone="brand">{solicitacoes.length} solicitações</Badge>
        </div>

        {carregando ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-32 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : solicitacoes.length === 0 ? (
          <EmptyState
            title="Nenhuma solicitação neste filtro"
            description="Quando um servidor solicitar retificação de horário, a demanda aparece aqui para análise."
            icon={<ShieldIcon className="h-6 w-6" />}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {solicitacoes.map((item) => {
              const atual = registroAtual(item);
              return (
                <li key={item.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3.5">
                      <Avatar nome={item.employeeNome} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-slate-800">
                          {item.employeeNome}
                          <span className="ml-2 text-[11px] font-normal text-slate-500">
                            Mat. {item.matricula} · {item.cargo}
                          </span>
                        </p>
                        <p className="mt-1 text-[13px] text-slate-600">
                          {formatDateLong(item.data)} · {ENTRY_LABELS[item.tipo]}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                          <span className="rounded-lg bg-slate-50 px-2.5 py-1 ring-1 ring-inset ring-slate-200">
                            Atual:{" "}
                            <strong className="font-mono text-slate-700">
                              {atual ? atual.hora.slice(0, 5) : "não registrado"}
                            </strong>
                          </span>
                          <span className="rounded-lg bg-accent-50 px-2.5 py-1 text-accent-700 ring-1 ring-inset ring-accent-200">
                            Solicitado:{" "}
                            <strong className="font-mono">
                              {item.horaSolicitada.slice(0, 5)}
                            </strong>
                          </span>
                        </div>
                        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-500">
                          <strong className="text-slate-600">Motivo:</strong> {item.motivo}
                        </p>
                        {item.parecer ? (
                          <p className="mt-2 max-w-2xl rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12px] text-slate-600 ring-1 ring-inset ring-slate-200">
                            <strong className="text-slate-700">Parecer:</strong> {item.parecer}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
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
                      <span className="text-[11px] text-slate-400">
                        Enviada em {formatDateTimeBR(item.createdAt)}
                      </span>
                      {item.status === "PENDENTE" ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="accent"
                            onClick={() => {
                              setDecisao({ solicitacao: item, aprovar: true });
                              setParecer("Aprovado conforme verificação da gestão escolar.");
                            }}
                          >
                            <CheckIcon className="h-4 w-4" /> Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setDecisao({ solicitacao: item, aprovar: false });
                              setParecer("");
                            }}
                          >
                            <CloseIcon className="h-4 w-4" /> Rejeitar
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExcluir(item)}
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 transition hover:text-rose-600"
                        >
                          <TrashIcon className="h-3.5 w-3.5" /> Excluir solicitação
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={Boolean(decisao)}
        onClose={() => setDecisao(null)}
        title={decisao?.aprovar ? "Aprovar retificação" : "Rejeitar retificação"}
        description={
          decisao
            ? `${decisao.solicitacao.employeeNome} · ${formatDateBR(
                decisao.solicitacao.data,
              )} · ${ENTRY_LABELS[decisao.solicitacao.tipo]}`
            : ""
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDecisao(null)}>
              Cancelar
            </Button>
            <Button
              variant={decisao?.aprovar ? "accent" : "danger"}
              loading={processando}
              onClick={confirmar}
            >
              {decisao?.aprovar ? "Confirmar aprovação" : "Confirmar rejeição"}
            </Button>
          </>
        }
      >
        {decisao ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3.5 text-[13px] text-slate-600 ring-1 ring-inset ring-slate-200">
              <div className="flex items-center gap-2 font-semibold text-slate-700">
                <ClockIcon className="h-4 w-4 text-brand-600" /> {formatDateBR(decisao.solicitacao.data)} ·{" "}
                {ENTRY_LABELS[decisao.solicitacao.tipo]}
              </div>
              <p className="mt-2">
                Horário registrado:{" "}
                <strong className="font-mono">
                  {registroAtual(decisao.solicitacao)?.hora.slice(0, 5) ?? "não registrado"}
                </strong>
              </p>
              <p>
                Horário solicitado:{" "}
                <strong className="font-mono text-accent-700">
                  {decisao.solicitacao.horaSolicitada.slice(0, 5)}
                </strong>
              </p>
              <p className="mt-2 italic">“{decisao.solicitacao.motivo}”</p>
            </div>

            {decisao.aprovar ? (
              <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Ao aprovar, o espelho de ponto será atualizado com o horário solicitado e a marcação
                ficará identificada como <strong>retificada</strong> na trilha de auditoria.
              </p>
            ) : null}

            <Field
              label="Parecer da gestão"
              hint={
                decisao.aprovar
                  ? "Opcional. Você pode registrar a verificação realizada."
                  : "Obrigatório. Explique ao servidor o motivo da rejeição."
              }
            >
              <Textarea
                value={parecer}
                onChange={(event) => setParecer(event.target.value)}
                placeholder="Ex.: Confirmado com a coordenação que houve atendimento no portão após o horário."
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(excluir)}
        onClose={() => setExcluir(null)}
        onConfirm={confirmarExclusao}
        loading={processando}
        title="Excluir solicitação"
        message="A solicitação será removida definitivamente do histórico. Deseja continuar?"
        confirmLabel="Excluir solicitação"
      />
    </div>
  );
}
