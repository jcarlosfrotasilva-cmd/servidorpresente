"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertIcon, CheckIcon, ClockIcon, CloseIcon, PlusIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/modal";
import { RetificacaoModal } from "@/components/retificacao-modal";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, SectionTitle } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  ENTRY_LABELS,
  formatDateBR,
  formatDateLong,
  formatDateTimeBR,
  todayISO,
  type EntryType,
} from "@/lib/time";

type Solicitacao = {
  id: number;
  data: string;
  tipo: EntryType;
  horaSolicitada: string;
  motivo: string;
  status: "PENDENTE" | "APROVADA" | "REJEITADA";
  parecer: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const STATUS_META = {
  PENDENTE: { tone: "warning" as const, label: "Em análise", icon: ClockIcon },
  APROVADA: { tone: "success" as const, label: "Aprovada", icon: CheckIcon },
  REJEITADA: { tone: "danger" as const, label: "Rejeitada", icon: CloseIcon },
};

export function SolicitacoesServidor({ nome }: { nome: string }) {
  const toast = useToast();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "PENDENTE" | "APROVADA" | "REJEITADA">("todos");
  const [abrirNova, setAbrirNova] = useState(false);
  const [cancelar, setCancelar] = useState<Solicitacao | null>(null);
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await apiFetch<{ solicitacoes: Solicitacao[] }>(
        `/api/retificacoes?status=${filtro}`,
      );
      setSolicitacoes(data.solicitacoes);
    } catch (error) {
      toast.error("Falha ao carregar solicitações", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtro, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const confirmarCancelamento = async () => {
    if (!cancelar) return;
    setProcessando(true);
    try {
      await apiFetch(`/api/retificacoes/${cancelar.id}`, { method: "DELETE" });
      toast.success("Solicitação cancelada");
      setCancelar(null);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível cancelar", (error as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  const contagem = {
    pendentes: solicitacoes.filter((item) => item.status === "PENDENTE").length,
    aprovadas: solicitacoes.filter((item) => item.status === "APROVADA").length,
    rejeitadas: solicitacoes.filter((item) => item.status === "REJEITADA").length,
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Minhas solicitações de retificação"
        description={`Acompanhe o parecer da gestão sobre os horários registrados indevidamente · ${nome}`}
        action={
          <Button variant="accent" onClick={() => setAbrirNova(true)}>
            <PlusIcon className="h-4 w-4" /> Nova solicitação
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Em análise", value: contagem.pendentes, tone: "warning" as const, status: "PENDENTE" as const },
          { label: "Aprovadas", value: contagem.aprovadas, tone: "success" as const, status: "APROVADA" as const },
          { label: "Rejeitadas", value: contagem.rejeitadas, tone: "danger" as const, status: "REJEITADA" as const },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setFiltro(filtro === item.status ? "todos" : item.status)}
            className={`card p-5 text-left transition ${
              filtro === item.status ? "ring-2 ring-brand-500/40" : "hover:border-brand-300"
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p>
            <Badge tone={item.tone} className="mt-3">
              {filtro === item.status ? "Filtrando" : "Clique para filtrar"}
            </Badge>
          </button>
        ))}
      </div>

      <Card>
        <div className="card-header">
          <p className="text-sm font-bold text-slate-800">Histórico de solicitações</p>
          <Badge tone="brand">{solicitacoes.length} registros</Badge>
        </div>

        {carregando ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : solicitacoes.length === 0 ? (
          <EmptyState
            title="Nenhuma solicitação encontrada"
            description="Quando um horário for registrado indevidamente, registre aqui a sua solicitação de retificação."
            icon={<AlertIcon className="h-6 w-6" />}
            action={
              <Button variant="outline" onClick={() => setAbrirNova(true)}>
                <PlusIcon className="h-4 w-4" /> Criar solicitação
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {solicitacoes.map((item) => {
              const meta = STATUS_META[item.status];
              const Icon = meta.icon;
              return (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
                  <div className="flex min-w-0 gap-3.5">
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${
                        item.status === "APROVADA"
                          ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
                          : item.status === "REJEITADA"
                            ? "bg-rose-50 text-rose-600 ring-rose-200"
                            : "bg-amber-50 text-amber-600 ring-amber-200"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">
                        {formatDateLong(item.data)} · {ENTRY_LABELS[item.tipo]}
                      </p>
                      <p className="mt-0.5 text-[13px] text-slate-600">
                        Horário solicitado:{" "}
                        <span className="font-mono font-bold text-brand-700">
                          {item.horaSolicitada.slice(0, 5)}
                        </span>
                      </p>
                      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">
                        {item.motivo}
                      </p>
                      {item.parecer ? (
                        <p className="mt-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12px] text-slate-600 ring-1 ring-inset ring-slate-200">
                          <strong className="text-slate-700">Parecer da gestão:</strong>{" "}
                          {item.parecer}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="text-[11px] text-slate-400">
                      Enviada em {formatDateTimeBR(item.createdAt)}
                    </span>
                    {item.status === "PENDENTE" ? (
                      <button
                        type="button"
                        onClick={() => setCancelar(item)}
                        className="text-[12px] font-semibold text-rose-600 hover:underline"
                      >
                        Cancelar solicitação
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <RetificacaoModal
        open={abrirNova}
        onClose={() => setAbrirNova(false)}
        alvo={{ data: todayISO() }}
        onSaved={() => void carregar()}
      />

      <ConfirmDialog
        open={Boolean(cancelar)}
        onClose={() => setCancelar(null)}
        onConfirm={confirmarCancelamento}
        loading={processando}
        title="Cancelar solicitação"
        message="A solicitação pendente será removida e não será analisada pela gestão. Deseja continuar?"
        confirmLabel="Cancelar solicitação"
      />
    </div>
  );
}
