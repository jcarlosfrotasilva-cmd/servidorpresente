"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertIcon, CheckIcon, ClockIcon, PlusIcon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Select, StatCard, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { formatDuration } from "@/lib/time";

type Movimentacao = {
  id: number;
  data: string;
  tipo: string;
  minutos: number;
  saldoAcumulado: number;
  descricao: string | null;
  aprovadoEm: string | null;
};

type Solicitacao = {
  id: number;
  tipo: string;
  minutos: number;
  motivo: string;
  status: string;
  dataSolicitacao: string;
  dataUso: string | null;
  justificativa: string | null;
};

type Configuracoes = {
  validadeMeses: number;
  limiteUsoDia: string;
  limiteUsoMes: string;
  saldoNegativoPermitido: boolean;
  saldoMinimo: string;
};

export function BancoHorasServidor({ employeeId, nome }: { employeeId: number; nome: string }) {
  const toast = useToast();
  const [saldo, setSaldo] = useState<{ atual: number; formatado: string }>({ atual: 0, formatado: "0h00min" });
  const [config, setConfig] = useState<Configuracoes | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [solicitando, setSolicitando] = useState(false);
  const [form, setForm] = useState({ tipo: "EXTRA", minutos: "30", dataUso: "", motivo: "" });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await apiFetch<{
        saldoAtual: number;
        saldoFormatado: string;
        configuracoes: Configuracoes | null;
        movimentacoes: Movimentacao[];
        solicitacoes: Solicitacao[];
      }>(`/api/banco-horas?employeeId=${employeeId}`);
      setSaldo({ atual: data.saldoAtual, formatado: data.saldoFormatado });
      setConfig(data.configuracoes);
      setMovimentacoes(data.movimentacoes);
      setSolicitacoes(data.solicitacoes);
    } catch (error) {
      toast.error("Falha ao carregar banco de horas", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [employeeId, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const solicitar = async () => {
    setSolicitando(true);
    try {
      await apiFetch("/api/banco-horas", {
        method: "POST",
        body: JSON.stringify({
          tipo: form.tipo,
          minutos: Number(form.minutos),
          dataUso: form.dataUso || null,
          motivo: form.motivo,
        }),
      });
      toast.success("Solicitação enviada", "Aguarde a aprovação da gestão.");
      setModalOpen(false);
      setForm({ tipo: "EXTRA", minutos: "30", dataUso: "", motivo: "" });
      void carregar();
    } catch (error) {
      toast.error("Falha ao solicitar", (error as Error).message);
    } finally {
      setSolicitando(false);
    }
  };

  const pendentes = solicitacoes.filter((s) => s.status === "PENDENTE");
  const aprovadas = solicitacoes.filter((s) => s.status === "APROVADA");
  const rejeitadas = solicitacoes.filter((s) => s.status === "REJEITADA");

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Meu Banco de Horas"
        description={`${nome} · Acompanhe seu saldo, histórico e solicite uso de horas.`}
        action={
          <Button onClick={() => setModalOpen(true)}>
            <PlusIcon className="h-4 w-4" /> Nova Solicitação
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Saldo Atual"
          value={saldo.formatado}
          hint={saldo.atual >= 0 ? "Horas disponíveis" : "Horas devendo"}
          tone={saldo.atual >= 0 ? "success" : "danger"}
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Pendentes"
          value={pendentes.length}
          hint="Aguardando aprovação"
          tone={pendentes.length > 0 ? "warning" : "success"}
          icon={<AlertIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Aprovadas (mês)"
          value={aprovadas.length}
          hint="Solicitações aprovadas"
          tone="success"
          icon={<CheckIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Configurações"
          value={config?.limiteUsoDia ?? "—"}
          hint={`Limite diário · ${config?.limiteUsoMes ?? "—"} / mês`}
          tone="info"
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="card-header">
            <p className="text-sm font-bold text-slate-800">Últimas Movimentações</p>
            <Badge tone="brand">{movimentacoes.length} registros</Badge>
          </div>
          {movimentacoes.length === 0 ? (
            <EmptyState
              title="Sem movimentações"
              description="Suas horas extras e compensações aparecerão aqui."
              icon={<ClockIcon className="h-6 w-6" />}
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {movimentacoes.slice(0, 10).map((mov) => (
                <div key={mov.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">
                      <Badge tone={mov.tipo === "EXTRA" ? "success" : mov.tipo === "DEBITO" ? "danger" : "info"}>
                        {mov.tipo}
                      </Badge>{" "}
                      {new Date(mov.data).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-[11px] text-slate-500">{mov.descricao || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-slate-800">{formatDuration(mov.minutos)}</p>
                    <p className="text-[10px] text-slate-400">Saldo: {formatDuration(mov.saldoAcumulado)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="card-header">
            <p className="text-sm font-bold text-slate-800">Minhas Solicitações</p>
            <Badge tone="neutral">{solicitacoes.length} total</Badge>
          </div>
          {solicitacoes.length === 0 ? (
            <EmptyState
              title="Nenhuma solicitação"
              description="Você ainda não solicitou horas extras ou uso de banco."
              icon={<ClockIcon className="h-6 w-6" />}
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {solicitacoes.slice(0, 10).map((sol) => (
                <div key={sol.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">
                      <Badge tone={sol.status === "APROVADA" ? "success" : sol.status === "REJEITADA" ? "danger" : "warning"}>
                        {sol.status}
                      </Badge>{" "}
                      {sol.tipo}
                    </p>
                    <p className="text-[11px] text-slate-500">{sol.motivo}</p>
                    {sol.justificativa && (
                      <p className="text-[10px] text-slate-400 mt-1">Obs: {sol.justificativa}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-slate-800">{formatDuration(sol.minutos)}</p>
                    <p className="text-[10px] text-slate-400">{new Date(sol.dataSolicitacao).toLocaleDateString("pt-BR")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova Solicitação de Banco de Horas"
        description="Solicite horas extras ou uso de saldo do banco."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button loading={solicitando} onClick={solicitar}>Enviar Solicitação</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo">
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="EXTRA">Hora Extra (crédito)</option>
                <option value="DEBITO">Uso de Banco (débito)</option>
                <option value="COMPENSACAO">Compensação</option>
              </Select>
            </Field>
            <Field label="Minutos">
              <Input
                type="number"
                min="1"
                max="480"
                value={form.minutos}
                onChange={(e) => setForm({ ...form, minutos: e.target.value })}
              />
            </Field>
          </div>
          {form.tipo === "DEBITO" && (
            <Field label="Data de Uso">
              <Input
                type="date"
                value={form.dataUso}
                onChange={(e) => setForm({ ...form, dataUso: e.target.value })}
              />
            </Field>
          )}
          <Field label="Motivo">
            <Textarea
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              placeholder="Ex.: Reunião extraordinária, compromisso pessoal, etc."
              rows={4}
            />
          </Field>
          {config && (
            <div className="rounded-xl bg-brand-50 px-3.5 py-3 text-[12px] text-brand-800 ring-1 ring-inset ring-brand-100">
              <p className="font-semibold">Regras do Banco de Horas:</p>
              <ul className="mt-1 space-y-0.5">
                <li>• Validade: {config.validadeMeses} meses</li>
                <li>• Limite uso/dia: {config.limiteUsoDia}</li>
                <li>• Limite uso/mês: {config.limiteUsoMes}</li>
                <li>• Saldo negativo: {config.saldoNegativoPermitido ? `Permitido (mín: ${config.saldoMinimo})` : "Não permitido"}</li>
              </ul>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
