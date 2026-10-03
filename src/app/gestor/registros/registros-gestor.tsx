"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons";
import { ConfirmDialog, Modal } from "@/components/modal";
import { RetificacaoModal } from "@/components/retificacao-modal";
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
  StatCard,
  TableWrap,
  Textarea,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  ENTRY_LABELS,
  ENTRY_ORDER,
  ENTRY_SHORT,
  formatDateBR,
  weekdayLabel,
  dayOfWeek,
  type EntryType,
} from "@/lib/time";

type Registro = {
  id: number;
  employeeId: number;
  employeeNome: string;
  matricula: string;
  data: string;
  tipo: EntryType;
  hora: string;
  origin: "SERVIDOR" | "GESTOR" | "RETIFICACAO";
  observacao: string | null;
};

type Servidor = { id: number; nome: string; matricula: string; cargo: string; jornadaNome: string | null };

const ORIGEM_META = {
  SERVIDOR: { tone: "brand" as const, label: "Aplicativo" },
  GESTOR: { tone: "warning" as const, label: "Gestão" },
  RETIFICACAO: { tone: "info" as const, label: "Retificado" },
};

export function RegistrosGestor({ mesInicial }: { mesInicial: string }) {
  const toast = useToast();
  const [mes, setMes] = useState(mesInicial);
  const [employeeId, setEmployeeId] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [busca, setBusca] = useState("");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [servidores, setServidores] = useState<Servidor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [retificacaoOpen, setRetificacaoOpen] = useState(false);
  const [editando, setEditando] = useState<Registro | null>(null);
  const [excluir, setExcluir] = useState<Registro | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    data: mesInicial + "-01",
    tipo: "ENTRADA" as EntryType,
    hora: "08:00",
    observacao: "",
    forcar: false,
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await apiFetch<{ registros: Registro[]; servidores: Servidor[] }>(
        `/api/registros?escopo=todos&mes=${mes}&employeeId=${employeeId}&tipo=${tipo}`,
      );
      setRegistros(data.registros);
      setServidores(data.servidores);
      setForm((current) => ({
        ...current,
        employeeId: current.employeeId || String(data.servidores[0]?.id ?? ""),
      }));
    } catch (error) {
      toast.error("Falha ao carregar registros", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes, employeeId, tipo, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return registros;
    const termo = busca.toLowerCase();
    return registros.filter(
      (registro) =>
        registro.employeeNome.toLowerCase().includes(termo) ||
        registro.matricula.toLowerCase().includes(termo) ||
        ENTRY_LABELS[registro.tipo].toLowerCase().includes(termo),
    );
  }, [registros, busca]);

  const kpis = useMemo(() => {
    const porServidorDia = new Map<string, number>();
    filtrados.forEach((registro) => {
      const key = `${registro.employeeId}-${registro.data}`;
      porServidorDia.set(key, (porServidorDia.get(key) ?? 0) + 1);
    });
    const incompletos = Array.from(porServidorDia.values()).filter((total) => total < 4).length;
    return {
      total: filtrados.length,
      servidores: new Set(filtrados.map((registro) => registro.employeeId)).size,
      dias: porServidorDia.size,
      incompletos,
    };
  }, [filtrados]);

  const lancar = async () => {
    setSalvando(true);
    try {
      await apiFetch("/api/registros", {
        method: "POST",
        body: JSON.stringify({
          employeeId: Number(form.employeeId),
          data: form.data,
          tipo: form.tipo,
          hora: form.hora,
          observacao: form.observacao,
          forcar: form.forcar,
        }),
      });
      toast.success("Marcação lançada", "O registro foi incluído com origem 'gestão'.");
      setNovoOpen(false);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível lançar", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    setSalvando(true);
    try {
      await apiFetch(`/api/registros/${editando.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          data: editando.data,
          tipo: editando.tipo,
          hora: editando.hora,
          observacao: editando.observacao,
        }),
      });
      toast.success("Registro atualizado", "A alteração foi registrada na trilha de auditoria.");
      setEditando(null);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível atualizar", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await apiFetch(`/api/registros/${excluir.id}`, { method: "DELETE" });
      toast.success("Registro excluído");
      setExcluir(null);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível excluir", (error as Error).message);
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Registros de ponto dos servidores"
        description="Consulte, corrija e exclua marcações. Toda alteração fica registrada na auditoria."
        action={
          <div className="flex flex-wrap gap-2.5">
            <Button variant="outline" onClick={() => setRetificacaoOpen(true)}>
              <AlertIcon className="h-4 w-4" /> Retificação
            </Button>
            <Button onClick={() => setNovoOpen(true)}>
              <PlusIcon className="h-4 w-4" /> Lançar marcação
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Marcações no período"
          value={kpis.total}
          hint={`${kpis.servidores} servidores · ${kpis.dias} jornadas`}
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Jornadas incompletas"
          value={kpis.incompletos}
          hint="Dias com menos de quatro batidas"
          tone={kpis.incompletos > 0 ? "warning" : "success"}
          icon={<AlertIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Competência"
          value={`${mes.slice(5, 7)}/${mes.slice(0, 4)}`}
          hint="Filtro de mês aplicado na consulta"
          tone="info"
          icon={<CalendarIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Servidores ativos"
          value={servidores.length}
          hint="Disponíveis para lançamento manual"
          tone="brand"
          icon={<CheckIcon className="h-[18px] w-[18px]" />}
        />
      </div>

      <Card>
        <div className="card-header">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Filtrar por servidor, matrícula ou marcação"
                className="input pl-9"
              />
            </div>
            <Input
              type="month"
              value={mes}
              onChange={(event) => setMes(event.target.value || mesInicial)}
              className="w-[160px]"
            />
            <Select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="w-[220px]"
            >
              <option value="todos">Todos os servidores</option>
              {servidores.map((servidor) => (
                <option key={servidor.id} value={servidor.id}>
                  {servidor.nome}
                </option>
              ))}
            </Select>
            <Select
              value={tipo}
              onChange={(event) => setTipo(event.target.value)}
              className="w-[190px]"
            >
              <option value="todos">Todas as marcações</option>
              {ENTRY_ORDER.map((item) => (
                <option key={item} value={item}>
                  {ENTRY_LABELS[item]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {carregando ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <EmptyState
            title="Nenhum registro encontrado"
            description="Ajuste os filtros ou lance manualmente uma marcação para o servidor."
            icon={<CalendarIcon className="h-6 w-6" />}
            action={
              <Button variant="outline" onClick={() => setNovoOpen(true)}>
                <PlusIcon className="h-4 w-4" /> Lançar marcação
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>Servidor</th>
                <th>Data</th>
                <th>Marcação</th>
                <th>Horário</th>
                <th>Origem</th>
                <th>Observação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, 400).map((registro) => {
                const origem = ORIGEM_META[registro.origin];
                return (
                  <tr key={registro.id}>
                    <td>
                      <p className="text-[13px] font-bold text-slate-800">
                        {registro.employeeNome}
                      </p>
                      <p className="text-[11px] text-slate-500">Mat. {registro.matricula}</p>
                    </td>
                    <td className="text-[12px] text-slate-600">
                      {formatDateBR(registro.data)}
                      <span className="ml-1.5 text-slate-400">
                        {weekdayLabel(dayOfWeek(registro.data))}
                      </span>
                    </td>
                    <td className="text-[12px] font-semibold text-slate-700">
                      {ENTRY_SHORT[registro.tipo]}
                    </td>
                    <td className="font-mono text-[13px] font-bold tabular-nums text-slate-800">
                      {registro.hora.slice(0, 5)}
                    </td>
                    <td>
                      <Badge tone={origem.tone}>{origem.label}</Badge>
                    </td>
                    <td className="max-w-[260px] text-[12px] text-slate-500">
                      {registro.observacao ?? "—"}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditando({ ...registro, hora: registro.hora.slice(0, 5) })}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-brand-400 hover:text-brand-700"
                          title="Editar marcação"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExcluir(registro)}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
                          title="Excluir marcação"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        title="Lançar marcação manual"
        description="Use quando o servidor não conseguir registrar a batida no aplicativo."
        footer={
          <>
            <Button variant="outline" onClick={() => setNovoOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={lancar}
              loading={salvando}
              disabled={!form.employeeId || !form.data || !form.hora}
            >
              Lançar marcação
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Servidor" className="sm:col-span-2">
            <Select
              value={form.employeeId}
              onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
            >
              {servidores.map((servidor) => (
                <option key={servidor.id} value={servidor.id}>
                  {servidor.nome} · Mat. {servidor.matricula}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data">
            <Input
              type="date"
              value={form.data}
              onChange={(event) => setForm({ ...form, data: event.target.value })}
            />
          </Field>
          <Field label="Marcação">
            <Select
              value={form.tipo}
              onChange={(event) => setForm({ ...form, tipo: event.target.value as EntryType })}
            >
              {ENTRY_ORDER.map((item) => (
                <option key={item} value={item}>
                  {ENTRY_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Horário">
            <Input
              type="time"
              value={form.hora}
              onChange={(event) => setForm({ ...form, hora: event.target.value })}
            />
          </Field>
          <Field label="Observação" className="sm:col-span-2">
            <Textarea
              value={form.observacao}
              onChange={(event) => setForm({ ...form, observacao: event.target.value })}
              placeholder="Ex.: Falha do equipamento; registro solicitado presencialmente."
            />
          </Field>
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12px] text-amber-900">
              <input
                type="checkbox"
                checked={form.forcar}
                onChange={(event) => setForm({ ...form, forcar: event.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600"
              />
              <span>
                <strong>Lançar como exceção</strong> — permite registrar fora do dia/horário
                cadastrado, em feriado, ponto facultativo ou durante ausência. Use somente quando
                houver respaldo documental; a justificativa fica registrada na auditoria.
              </span>
            </label>
          </div>
          <p className="text-[11px] text-slate-400 sm:col-span-2">
            Dias e horários cadastrados: o sistema bloqueia o registro do servidor fora da janela
            liberada. O lançamento manual exige a confirmação de exceção acima.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(editando)}
        onClose={() => setEditando(null)}
        title="Editar marcação"
        description={editando ? `${editando.employeeNome} · Mat. ${editando.matricula}` : ""}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} loading={salvando}>
              Salvar alteração
            </Button>
          </>
        }
      >
        {editando ? (
          <div className="space-y-4">
            <Field label="Data">
              <Input
                type="date"
                value={editando.data}
                onChange={(event) => setEditando({ ...editando, data: event.target.value })}
              />
            </Field>
            <Field label="Marcação">
              <Select
                value={editando.tipo}
                onChange={(event) =>
                  setEditando({ ...editando, tipo: event.target.value as EntryType })
                }
              >
                {ENTRY_ORDER.map((item) => (
                  <option key={item} value={item}>
                    {ENTRY_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Horário">
              <Input
                type="time"
                value={editando.hora.slice(0, 5)}
                onChange={(event) => setEditando({ ...editando, hora: event.target.value })}
              />
            </Field>
            <Field label="Observação da alteração">
              <Textarea
                value={editando.observacao ?? ""}
                onChange={(event) =>
                  setEditando({ ...editando, observacao: event.target.value })
                }
                placeholder="Registre o motivo da correção."
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <RetificacaoModal
        open={retificacaoOpen}
        onClose={() => setRetificacaoOpen(false)}
        alvo={{ data: mes + "-01" }}
        servidores={servidores.map((servidor) => ({
          id: servidor.id,
          nome: servidor.nome,
          matricula: servidor.matricula,
        }))}
        onSaved={() => void carregar()}
      />

      <ConfirmDialog
        open={Boolean(excluir)}
        onClose={() => setExcluir(null)}
        onConfirm={confirmarExclusao}
        loading={excluindo}
        title="Excluir marcação"
        message={
          excluir
            ? `Confirma a exclusão da marcação de ${ENTRY_LABELS[excluir.tipo]} de ${formatDateBR(
                excluir.data,
              )} (${excluir.hora.slice(0, 5)}) do servidor ${excluir.employeeNome}?`
            : ""
        }
        confirmLabel="Excluir marcação"
      />
    </div>
  );
}
