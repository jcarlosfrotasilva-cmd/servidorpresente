"use client";

import { useCallback, useEffect, useState } from "react";
import { ClockIcon, PencilIcon, PlusIcon, TrashIcon, UsersIcon } from "@/components/icons";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import {
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
  WEEKDAYS,
  computeWorkedMinutes,
  formatDuration,
  minutesToTime,
  parseTime,
} from "@/lib/time";

type Jornada = {
  id: number;
  nome: string;
  descricao: string | null;
  entrada: string;
  saidaAlmoco: string | null;
  retornoAlmoco: string | null;
  saidaExpediente: string;
  cargaDiariaMin: number | null;
  toleranciaMin: number;
  diasSemana: number[];
  ativo: boolean;
  servidores: number;
};

const emptyForm = {
  nome: "",
  descricao: "",
  entrada: "07:00",
  saidaAlmoco: "11:30",
  retornoAlmoco: "13:00",
  saidaExpediente: "17:00",
  temAlmoco: true,
  toleranciaMin: "10",
  diasSemana: [1, 2, 3, 4, 5],
  ativo: true,
};

export function JornadasGestor() {
  const toast = useToast();
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Jornada | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<Jornada | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await apiFetch<{ jornadas: Jornada[] }>("/api/jornadas");
      setJornadas(data.jornadas);
    } catch (error) {
      toast.error("Falha ao carregar jornadas", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrirNova = () => {
    setEditando(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const abrirEdicao = (jornada: Jornada) => {
    setEditando(jornada);
    setForm({
      nome: jornada.nome,
      descricao: jornada.descricao ?? "",
      entrada: jornada.entrada.slice(0, 5),
      saidaAlmoco: jornada.saidaAlmoco?.slice(0, 5) ?? "",
      retornoAlmoco: jornada.retornoAlmoco?.slice(0, 5) ?? "",
      saidaExpediente: jornada.saidaExpediente.slice(0, 5),
      temAlmoco: Boolean(jornada.saidaAlmoco && jornada.retornoAlmoco),
      toleranciaMin: String(jornada.toleranciaMin),
      diasSemana: jornada.diasSemana,
      ativo: jornada.ativo,
    });
    setModalOpen(true);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome,
        descricao: form.descricao,
        entrada: form.entrada,
        saidaExpediente: form.saidaExpediente,
        saidaAlmoco: form.temAlmoco ? form.saidaAlmoco : "",
        retornoAlmoco: form.temAlmoco ? form.retornoAlmoco : "",
        toleranciaMin: Number(form.toleranciaMin || 10),
        diasSemana: form.diasSemana,
        ativo: form.ativo,
      };
      if (editando) {
        await apiFetch(`/api/jornadas/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Modelo atualizado", "Aplique o modelo no cadastro do servidor quando necessário.");
      } else {
        await apiFetch("/api/jornadas", { method: "POST", body: JSON.stringify(payload) });
        toast.success(
          "Modelo criado",
          "Use a opção Aplicar modelo no cadastro do servidor como ponto de partida.",
        );
      }
      setModalOpen(false);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível salvar", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await apiFetch(`/api/jornadas/${excluir.id}`, { method: "DELETE" });
      toast.success("Jornada excluída");
      setExcluir(null);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível excluir", (error as Error).message);
    } finally {
      setExcluindo(false);
    }
  };

  const toggleDia = (iso: number) => {
    setForm((current) => ({
      ...current,
      diasSemana: current.diasSemana.includes(iso)
        ? current.diasSemana.filter((dia) => dia !== iso)
        : [...current.diasSemana, iso].sort((a, b) => a - b),
    }));
  };

  const cargaPrevista = computeWorkedMinutes({
    ENTRADA: form.entrada,
    SAIDA_ALMOCO: form.temAlmoco ? form.saidaAlmoco : null,
    RETORNO_ALMOCO: form.temAlmoco ? form.retornoAlmoco : null,
    SAIDA_EXPEDIENTE: form.saidaExpediente,
  });

  const intervaloTempo =
    form.temAlmoco &&
    (parseTime(form.retornoAlmoco) ?? 0) > (parseTime(form.saidaAlmoco) ?? 0)
      ? (parseTime(form.retornoAlmoco) ?? 0) - (parseTime(form.saidaAlmoco) ?? 0)
      : 0;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Modelos de jornada (apoio)"
        description="Cadastre modelos de horário prontos para agilizar a definição do horário individual de cada servidor. O horário individual é sempre o que vale para o ponto."
        action={
          <Button onClick={abrirNova}>
            <PlusIcon className="h-4 w-4" /> Novo modelo
          </Button>
        }
      />

      {carregando ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-56 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : jornadas.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma jornada cadastrada"
            description="Crie as jornadas de trabalho para que os servidores possam registrar o ponto."
            icon={<ClockIcon className="h-6 w-6" />}
            action={
              <Button variant="outline" onClick={abrirNova}>
                <PlusIcon className="h-4 w-4" /> Criar jornada
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {jornadas.map((jornada) => {
            const carga = jornada.cargaDiariaMin ?? 0;
            const interval =
              jornada.saidaAlmoco && jornada.retornoAlmoco
                ? (parseTime(jornada.retornoAlmoco) ?? 0) - (parseTime(jornada.saidaAlmoco) ?? 0)
                : 0;
            return (
              <Card key={jornada.id} className="animate-fade-up p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[15px] font-bold text-slate-900">{jornada.nome}</h3>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {jornada.descricao ?? "Sem descrição cadastrada"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={jornada.ativo ? "success" : "neutral"}>
                      {jornada.ativo ? "Ativa" : "Inativa"}
                    </Badge>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => abrirEdicao(jornada)}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-brand-400 hover:text-brand-700"
                        title="Editar jornada"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExcluir(jornada)}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
                        title="Excluir jornada"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {[
                    { label: "Entrada", value: jornada.entrada.slice(0, 5) },
                    { label: "Saída almoço", value: jornada.saidaAlmoco?.slice(0, 5) ?? "--:--" },
                    { label: "Retorno", value: jornada.retornoAlmoco?.slice(0, 5) ?? "--:--" },
                    { label: "Saída", value: jornada.saidaExpediente.slice(0, 5) },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {item.label}
                      </p>
                      <p className="font-mono text-sm font-bold tabular-nums text-slate-800">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {WEEKDAYS.map((weekday) => {
                    const ativo = jornada.diasSemana.includes(weekday.iso);
                    return (
                      <span
                        key={weekday.iso}
                        className={`grid h-8 w-9 place-items-center rounded-lg text-[11px] font-bold ring-1 ring-inset ${
                          ativo
                            ? "bg-brand-600 text-white ring-brand-600"
                            : "bg-slate-50 text-slate-400 ring-slate-200"
                        }`}
                      >
                        {weekday.short}
                      </span>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5 text-[12px] text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <ClockIcon className="h-4 w-4 text-brand-600" />
                    Carga diária <strong className="text-slate-800">{formatDuration(carga)}</strong>
                    {interval > 0 ? ` · intervalo de ${formatDuration(interval)}` : ""}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <UsersIcon className="h-4 w-4 text-brand-600" />
                    <strong className="text-slate-800">{jornada.servidores}</strong> servidor(es)
                  </span>
                  <span>Tolerância de {jornada.toleranciaMin} min</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? `Editar ${editando.nome}` : "Novo modelo de jornada"}
        description="O modelo serve de base: ao aplicar no cadastro do servidor, os horários podem ser ajustados dia a dia."
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              loading={salvando}
              disabled={form.nome.trim().length < 3 || form.diasSemana.length === 0}
            >
              {editando ? "Salvar jornada" : "Criar jornada"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="Nome da jornada">
            <Input
              value={form.nome}
              onChange={(event) => setForm({ ...form, nome: event.target.value })}
              placeholder="Ex.: Docente — Turno da manhã"
            />
          </Field>
          <Field label="Descrição">
            <Textarea
              value={form.descricao}
              onChange={(event) => setForm({ ...form, descricao: event.target.value })}
              placeholder="Quem utiliza esta jornada e observações relevantes."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Entrada">
              <Input
                type="time"
                value={form.entrada}
                onChange={(event) => setForm({ ...form, entrada: event.target.value })}
              />
            </Field>
            <Field label="Saída do expediente">
              <Input
                type="time"
                value={form.saidaExpediente}
                onChange={(event) => setForm({ ...form, saidaExpediente: event.target.value })}
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <label className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={form.temAlmoco}
                onChange={(event) => setForm({ ...form, temAlmoco: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              A jornada possui intervalo de almoço (4 batidas diárias)
            </label>
            {form.temAlmoco ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Saída para o almoço">
                  <Input
                    type="time"
                    value={form.saidaAlmoco}
                    onChange={(event) => setForm({ ...form, saidaAlmoco: event.target.value })}
                  />
                </Field>
                <Field label="Retorno do almoço">
                  <Input
                    type="time"
                    value={form.retornoAlmoco}
                    onChange={(event) => setForm({ ...form, retornoAlmoco: event.target.value })}
                  />
                </Field>
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-slate-500">
                Jornadas sem intervalo registram apenas entrada e saída do expediente.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tolerância de atraso (minutos)">
              <Select
                value={form.toleranciaMin}
                onChange={(event) => setForm({ ...form, toleranciaMin: event.target.value })}
              >
                {[0, 5, 10, 15, 20, 30].map((value) => (
                  <option key={value} value={value}>
                    {value} minutos
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dias de trabalho">
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((weekday) => {
                  const ativo = form.diasSemana.includes(weekday.iso);
                  return (
                    <button
                      key={weekday.iso}
                      type="button"
                      onClick={() => toggleDia(weekday.iso)}
                      className={`h-9 w-11 rounded-lg text-[11px] font-bold ring-1 ring-inset transition ${
                        ativo
                          ? "bg-brand-600 text-white ring-brand-600"
                          : "bg-white text-slate-500 ring-slate-200 hover:ring-brand-300"
                      }`}
                    >
                      {weekday.short}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-3.5 text-[13px] text-brand-800 ring-1 ring-inset ring-brand-100">
            <span className="font-semibold">Carga diária calculada</span>
            <span className="font-mono font-bold">
              {formatDuration(cargaPrevista)} ({minutesToTime(cargaPrevista)})
              {intervaloTempo > 0 ? ` · intervalo ${formatDuration(intervaloTempo)}` : ""}
            </span>
          </div>

          <label className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(event) => setForm({ ...form, ativo: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Modelo ativo
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(excluir)}
        onClose={() => setExcluir(null)}
        onConfirm={confirmarExclusao}
        loading={excluindo}
        title={`Excluir ${excluir?.nome ?? "jornada"}`}
        message="Somente jornadas sem servidores vinculados podem ser excluídas. Se houver vínculos, desative a jornada ou altere o cadastro dos servidores."
        confirmLabel="Excluir jornada"
      />
    </div>
  );
}
