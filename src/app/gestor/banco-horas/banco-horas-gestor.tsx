"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertIcon, CheckIcon, ClockIcon, CloseIcon, DownloadIcon, UsersIcon } from "@/components/icons";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Select, StatCard, TableWrap, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { formatDuration } from "@/lib/time";

type Solicitacao = {
  id: number;
  employeeId: number;
  employeeNome?: string;
  tipo: string;
  minutos: number;
  motivo: string;
  status: string;
  dataSolicitacao: string;
  dataUso: string | null;
  aprovadoEm: string | null;
  justificativa: string | null;
};

type SaldoServidor = {
  employeeId: number;
  nome: string;
  matricula: string;
  saldoMinutos: number;
  saldoFormatado: string;
};

export function BancoHorasGestor() {
  const toast = useToast();
  const [aba, setAba] = useState<"pendentes" | "saldos" | "historico">("pendentes");
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [saldos, setSaldos] = useState<SaldoServidor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [confirmacao, setConfirmacao] = useState<{ id: number; aprovar: boolean } | null>(null);
  const [erroConfig, setErroConfig] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroConfig(null);
    try {
      const configCheck = await apiFetch<{ config: any }>("/api/banco-horas/config");
      if (!configCheck.config) {
        setErroConfig("Configurações não inicializadas. Clique em 'Inicializar Configurações'.");
      }
      
      const [solicitacoesData, saldosData] = await Promise.all([
        apiFetch<{ solicitacoes: Solicitacao[] }>("/api/banco-horas/solicitacoes"),
        apiFetch<{ saldos: SaldoServidor[] }>("/api/banco-horas/saldos"),
      ]);
      setSolicitacoes(solicitacoesData.solicitacoes);
      setSaldos(saldosData.saldos);
    } catch (error) {
      toast.error("Falha ao carregar banco de horas", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aprovar = async (id: number, aprovar: boolean) => {
    setProcessando(id);
    try {
      await apiFetch(`/api/banco-horas/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          decisao: aprovar ? "APROVADA" : "REJEITADA",
          justificativa,
        }),
      });
      toast.success(
        aprovar ? "Solicitação aprovada" : "Solicitação rejeitada",
        `A movimentação foi ${aprovar ? "creditada" : "recusada"} no banco de horas.`,
      );
      setConfirmacao(null);
      setJustificativa("");
      void carregar();
    } catch (error) {
      toast.error("Falha ao processar", (error as Error).message);
    } finally {
      setProcessando(null);
    }
  };

  const pendentes = solicitacoes.filter((s) => s.status === "PENDENTE");
  const analisadas = solicitacoes.filter((s) => s.status !== "PENDENTE");

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Banco de Horas"
        description="Aprove solicitações de horas extras e uso de banco, acompanhe saldos e histórico."
        action={
          <div className="flex flex-wrap gap-2.5">
            {erroConfig && (
              <Button variant="accent" onClick={async () => {
                try {
                  await apiFetch("/api/banco-horas/init", { method: "POST" });
                  setErroConfig(null);
                  toast.success("Configurações inicializadas", "Agora você pode usar o banco de horas.");
                  void carregar();
                } catch (error) {
                  toast.error("Falha ao inicializar", (error as Error).message);
                }
              }}>
                <CheckIcon className="h-4 w-4" /> Inicializar Configurações
              </Button>
            )}
            <Button variant="outline" onClick={() => void carregar()}>
              <CheckIcon className="h-4 w-4" /> Atualizar
            </Button>
          </div>
        }
      />
      
      {erroConfig && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800 ring-1 ring-inset ring-amber-200">
          <p className="font-semibold">⚠️ {erroConfig}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2.5">
        {[
          { id: "pendentes" as const, label: "Pendentes", icon: ClockIcon, count: pendentes.length },
          { id: "saldos" as const, label: "Saldos", icon: UsersIcon, count: saldos.length },
          { id: "historico" as const, label: "Histórico", icon: DownloadIcon, count: analisadas.length },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAba(item.id)}
              className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
                aba === item.id
                  ? "bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm"
                  : "border border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-700"
              }`}
            >
              <Icon className="h-4 w-4" /> {item.label}
              {item.count > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${aba === item.id ? "bg-white/20 text-white" : "bg-brand-100 text-brand-700"}`}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {aba === "pendentes" && (
        <Card>
          <div className="card-header">
            <p className="text-sm font-bold text-slate-800">Solicitações Pendentes</p>
            <Badge tone="warning">{pendentes.length} aguardando</Badge>
          </div>
          {pendentes.length === 0 ? (
            <EmptyState
              title="Nenhuma solicitação pendente"
              description="Quando os servidores solicitarem horas extras ou uso de banco, aparecerão aqui."
              icon={<CheckIcon className="h-6 w-6" />}
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>Servidor</th>
                  <th>Tipo</th>
                  <th>Minutos</th>
                  <th>Data Uso</th>
                  <th>Motivo</th>
                  <th>Solicitado em</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((sol) => (
                  <tr key={sol.id}>
                    <td className="font-semibold">{sol.employeeNome || `ID ${sol.employeeId}`}</td>
                    <td>
                      <Badge tone={sol.tipo === "EXTRA" ? "success" : sol.tipo === "DEBITO" ? "danger" : "info"}>
                        {sol.tipo}
                      </Badge>
                    </td>
                    <td className="font-mono">{formatDuration(sol.minutos)}</td>
                    <td>{sol.dataUso || "—"}</td>
                    <td className="max-w-[300px] truncate">{sol.motivo}</td>
                    <td>{new Date(sol.dataSolicitacao).toLocaleDateString("pt-BR")}</td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="accent"
                          loading={processando === sol.id}
                          onClick={() => setConfirmacao({ id: sol.id, aprovar: true })}
                        >
                          <CheckIcon className="h-3.5 w-3.5" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={processando === sol.id}
                          onClick={() => setConfirmacao({ id: sol.id, aprovar: false })}
                        >
                          <CloseIcon className="h-3.5 w-3.5" /> Rejeitar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {aba === "saldos" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {saldos.map((servidor) => (
            <Card key={servidor.employeeId} className="p-5">
              <div className="flex items-center gap-3">
                <Avatar nome={servidor.nome} />
                <div>
                  <p className="font-bold text-slate-800">{servidor.nome}</p>
                  <p className="text-xs text-slate-500">Mat. {servidor.matricula}</p>
                </div>
              </div>
              <div className="mt-4 text-center">
                <p className="text-3xl font-bold font-mono" style={{ color: servidor.saldoMinutos >= 0 ? "#059669" : "#DC2626" }}>
                  {servidor.saldoFormatado}
                </p>
                <p className="text-xs text-slate-500 mt-1">Saldo acumulado</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(confirmacao)}
        onClose={() => setConfirmacao(null)}
        title={confirmacao?.aprovar ? "Aprovar solicitação" : "Rejeitar solicitação"}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmacao(null)}>Cancelar</Button>
            <Button
              variant={confirmacao?.aprovar ? "accent" : "danger"}
              loading={processando !== null}
              onClick={() => confirmacao && aprovar(confirmacao.id, confirmacao.aprovar)}
            >
              {confirmacao?.aprovar ? "Aprovar" : "Rejeitar"}
            </Button>
          </>
        }
      >
        <Field
          label="Justificativa (opcional)"
          hint={confirmacao?.aprovar ? "Comentário sobre a aprovação" : "Motivo da rejeição (obrigatório para rejeitar)"}
        >
          <Textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Digite aqui..."
            rows={4}
          />
        </Field>
      </Modal>
    </div>
  );
}
