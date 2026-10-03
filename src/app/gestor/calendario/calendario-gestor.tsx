"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UsersIcon,
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
  TableWrap,
  Textarea,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  AUSENCIA_SHORT,
  AUSENCIA_TIPOS,
  AUSENCIA_TONE,
  HOLIDAY_TIPOS,
  absencePeriodLabel,
  holidayTone,
  type AusenciaTipo,
} from "@/lib/ausencias";
import { formatDateBR, todayISO, weekdayLabel, dayOfWeek } from "@/lib/time";

type Feriado = {
  id: number;
  data: string;
  nome: string;
  tipo: string;
  bloqueiaPonto: boolean;
  descricao: string | null;
  diaSemana: number;
};

type Ausencia = {
  id: number;
  employeeId: number;
  employeeNome: string;
  matricula: string;
  cargo: string;
  tipo: AusenciaTipo;
  periodo: "DIA_INTEIRO" | "PARCIAL";
  dataInicio: string;
  dataFim: string;
  horaInicio: string | null;
  horaFim: string | null;
  motivo: string | null;
  documento: string | null;
  status: "ATIVA" | "CANCELADA";
};

type Servidor = { id: number; nome: string; matricula: string; cargo: string };

const emptyFeriado = {
  data: "",
  nome: "",
  tipo: "FERIADO",
  bloqueiaPonto: true,
  descricao: "",
};

const emptyAusencia = {
  employeeId: "",
  tipo: "FERIAS" as AusenciaTipo,
  periodo: "DIA_INTEIRO" as "DIA_INTEIRO" | "PARCIAL",
  dataInicio: "",
  dataFim: "",
  horaInicio: "08:00",
  horaFim: "12:00",
  motivo: "",
  documento: "",
};

export function CalendarioGestor({ anoInicial }: { anoInicial: number }) {
  const toast = useToast();
  const [aba, setAba] = useState<"feriados" | "ausencias">("feriados");
  const [ano, setAno] = useState(String(anoInicial));

  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [servidores, setServidores] = useState<Servidor[]>([]);
  const [resumo, setResumo] = useState({ ativas: 0, emCurso: 0, parciais: 0 });
  const [carregando, setCarregando] = useState(true);

  const [filtroServidor, setFiltroServidor] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("ATIVA");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [busca, setBusca] = useState("");

  const [feriadoModal, setFeriadoModal] = useState(false);
  const [feriadoEditando, setFeriadoEditando] = useState<Feriado | null>(null);
  const [feriadoForm, setFeriadoForm] = useState({ ...emptyFeriado });

  const [ausenciaModal, setAusenciaModal] = useState(false);
  const [ausenciaEditando, setAusenciaEditando] = useState<Ausencia | null>(null);
  const [ausenciaForm, setAusenciaForm] = useState({ ...emptyAusencia });

  const [salvando, setSalvando] = useState(false);
  const [excluirFeriado, setExcluirFeriado] = useState<Feriado | null>(null);
  const [excluirAusencia, setExcluirAusencia] = useState<Ausencia | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [feriadosData, ausenciasData] = await Promise.all([
        apiFetch<{ feriados: Feriado[]; proximos: Feriado[] }>(`/api/feriados?ano=${ano}`),
        apiFetch<{
          ausencias: Ausencia[];
          servidores: Servidor[];
          resumo: { ativas: number; emCurso: number; parciais: number };
        }>(
          `/api/ausencias?employeeId=${filtroServidor}&status=${filtroStatus}&tipo=${filtroTipo}`,
        ),
      ]);
      setFeriados(feriadosData.feriados);
      setAusencias(ausenciasData.ausencias);
      setServidores(ausenciasData.servidores);
      setResumo(ausenciasData.resumo);
    } catch (error) {
      toast.error("Falha ao carregar o calendário", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [ano, filtroServidor, filtroStatus, filtroTipo, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const hoje = todayISO();

  const feriadosFiltrados = useMemo(() => {
    if (!busca.trim()) return feriados;
    const termo = busca.toLowerCase();
    return feriados.filter((item) => item.nome.toLowerCase().includes(termo));
  }, [feriados, busca]);

  const abrirNovoFeriado = () => {
    setFeriadoEditando(null);
    setFeriadoForm({ ...emptyFeriado, data: "", nome: "" });
    setFeriadoModal(true);
  };

  const abrirEdicaoFeriado = (feriado: Feriado) => {
    setFeriadoEditando(feriado);
    setFeriadoForm({
      data: feriado.data,
      nome: feriado.nome,
      tipo: feriado.tipo,
      bloqueiaPonto: feriado.bloqueiaPonto,
      descricao: feriado.descricao ?? "",
    });
    setFeriadoModal(true);
  };

  const salvarFeriado = async () => {
    setSalvando(true);
    try {
      const payload = { ...feriadoForm };
      if (feriadoEditando) {
        await apiFetch(`/api/feriados/${feriadoEditando.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Data atualizada");
      } else {
        await apiFetch("/api/feriados", { method: "POST", body: JSON.stringify(payload) });
        toast.success(
          "Data cadastrada",
          feriadoForm.bloqueiaPonto
            ? "O registro de ponto ficará bloqueado nesta data."
            : "Registro de ponto liberado, mas a data consta no calendário.",
        );
      }
      setFeriadoModal(false);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível salvar", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const abrirNovaAusencia = () => {
    setAusenciaEditando(null);
    setAusenciaForm({
      ...emptyAusencia,
      employeeId: servidores[0] ? String(servidores[0].id) : "",
      dataInicio: hoje,
      dataFim: hoje,
    });
    setAusenciaModal(true);
  };

  const abrirEdicaoAusencia = (ausencia: Ausencia) => {
    setAusenciaEditando(ausencia);
    setAusenciaForm({
      employeeId: String(ausencia.employeeId),
      tipo: ausencia.tipo,
      periodo: ausencia.periodo,
      dataInicio: ausencia.dataInicio,
      dataFim: ausencia.dataFim,
      horaInicio: ausencia.horaInicio?.slice(0, 5) ?? "08:00",
      horaFim: ausencia.horaFim?.slice(0, 5) ?? "12:00",
      motivo: ausencia.motivo ?? "",
      documento: ausencia.documento ?? "",
    });
    setAusenciaModal(true);
  };

  const salvarAusencia = async () => {
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        employeeId: Number(ausenciaForm.employeeId),
        tipo: ausenciaForm.tipo,
        periodo: ausenciaForm.periodo,
        dataInicio: ausenciaForm.dataInicio,
        dataFim: ausenciaForm.periodo === "PARCIAL" ? ausenciaForm.dataInicio : ausenciaForm.dataFim,
        motivo: ausenciaForm.motivo,
        documento: ausenciaForm.documento,
      };
      if (ausenciaForm.periodo === "PARCIAL") {
        payload.horaInicio = ausenciaForm.horaInicio;
        payload.horaFim = ausenciaForm.horaFim;
      }
      if (ausenciaEditando) {
        await apiFetch(`/api/ausencias/${ausenciaEditando.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Ausência atualizada");
      } else {
        await apiFetch("/api/ausencias", { method: "POST", body: JSON.stringify(payload) });
        toast.success(
          "Ausência registrada",
          ausenciaForm.periodo === "DIA_INTEIRO"
            ? "O servidor não poderá registrar ponto nos dias informados."
            : "O servidor não poderá registrar ponto dentro da faixa de horário informada.",
        );
      }
      setAusenciaModal(false);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível salvar", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const cancelarAusencia = async (ausencia: Ausencia) => {
    setSalvando(true);
    try {
      await apiFetch(`/api/ausencias/${ausencia.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELADA" }),
      });
      toast.success("Ausência cancelada", "O servidor volta a poder registrar ponto no período.");
      void carregar();
    } catch (error) {
      toast.error("Não foi possível cancelar", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusoes = async () => {
    setSalvando(true);
    try {
      if (excluirFeriado) {
        await apiFetch(`/api/feriados/${excluirFeriado.id}`, { method: "DELETE" });
        toast.success("Data removida");
        setExcluirFeriado(null);
      }
      if (excluirAusencia) {
        await apiFetch(`/api/ausencias/${excluirAusencia.id}`, { method: "DELETE" });
        toast.success("Ausência excluída");
        setExcluirAusencia(null);
      }
      void carregar();
    } catch (error) {
      toast.error("Não foi possível excluir", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const anos = useMemo(() => {
    const base = Number(ano);
    return [base - 1, base, base + 1, base + 2].map(String);
  }, [ano]);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Calendário escolar e ausências"
        description="Cadastre feriados, pontos facultativos e recessos para bloquear o ponto, e registre ausências totais ou parciais dos servidores."
        action={
          <div className="flex flex-wrap gap-2.5">
            <Button variant="outline" onClick={abrirNovaAusencia}>
              <UsersIcon className="h-4 w-4" /> Nova ausência
            </Button>
            <Button onClick={abrirNovoFeriado}>
              <PlusIcon className="h-4 w-4" /> Novo feriado
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2.5">
        {[
          { id: "feriados" as const, label: "Feriados e pontos facultativos", icon: CalendarIcon },
          { id: "ausencias" as const, label: "Ausências dos servidores", icon: UsersIcon },
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
              {item.id === "ausencias" && resumo.emCurso > 0 ? (
                <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                  {resumo.emCurso} em curso
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {aba === "feriados" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Datas cadastradas em {ano}
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{feriados.length}</p>
              <p className="mt-1 text-xs text-slate-500">
                {feriados.filter((item) => item.bloqueiaPonto).length} bloqueiam o registro de ponto
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Próximas datas
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {feriados.filter((item) => item.data >= hoje).length}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {feriados.find((item) => item.data >= hoje)
                  ? `${feriados.find((item) => item.data >= hoje)?.nome} em ${formatDateBR(
                      feriados.find((item) => item.data >= hoje)?.data ?? "",
                    )}`
                  : "Nenhuma data futura cadastrada"}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Tipos disponíveis
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {HOLIDAY_TIPOS.map((tipo) => (
                  <Badge key={tipo.value} tone={tipo.tone}>
                    {tipo.label}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="card-header">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative min-w-[200px] flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={busca}
                    onChange={(event) => setBusca(event.target.value)}
                    placeholder="Buscar data pelo nome"
                    className="input pl-9"
                  />
                </div>
                <Select
                  value={ano}
                  onChange={(event) => setAno(event.target.value)}
                  className="w-[130px]"
                >
                  {anos.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </div>
              <Badge tone="brand">{feriadosFiltrados.length} datas</Badge>
            </div>

            {carregando ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : feriadosFiltrados.length === 0 ? (
              <EmptyState
                title="Nenhuma data cadastrada neste ano"
                description="Cadastre feriados, pontos facultativos e recessos para que o registro de ponto seja bloqueado automaticamente."
                icon={<CalendarIcon className="h-6 w-6" />}
                action={
                  <Button variant="outline" onClick={abrirNovoFeriado}>
                    <PlusIcon className="h-4 w-4" /> Cadastrar data
                  </Button>
                }
              />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Tipo</th>
                    <th>Bloqueia ponto</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {feriadosFiltrados.map((feriado) => (
                    <tr key={feriado.id}>
                      <td>
                        <p className="text-[13px] font-bold text-slate-800">
                          {formatDateBR(feriado.data)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {weekdayLabel(dayOfWeek(feriado.data), true)}
                          {feriado.data >= hoje ? "" : " · já ocorreu"}
                        </p>
                      </td>
                      <td className="text-[12px] text-slate-600">
                        <p className="font-semibold text-slate-700">{feriado.nome}</p>
                        <p className="text-slate-400">{feriado.descricao ?? "—"}</p>
                      </td>
                      <td>
                        <Badge tone={holidayTone(feriado.tipo)}>
                          {HOLIDAY_TIPOS.find((item) => item.value === feriado.tipo)?.label ??
                            feriado.tipo}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={feriado.bloqueiaPonto ? "danger" : "neutral"}>
                          {feriado.bloqueiaPonto ? "Bloqueado" : "Liberado"}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrirEdicaoFeriado(feriado)}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-brand-400 hover:text-brand-700"
                            title="Editar data"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setExcluirFeriado(feriado)}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
                            title="Excluir data"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Ausências ativas
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{resumo.ativas}</p>
              <p className="mt-1 text-xs text-slate-500">Registros válidos no sistema</p>
            </Card>
            <Card className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Em curso hoje
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{resumo.emCurso}</p>
              <p className="mt-1 text-xs text-slate-500">Servidores com ponto bloqueado hoje</p>
            </Card>
            <Card className="p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Ausências parciais
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{resumo.parciais}</p>
              <p className="mt-1 text-xs text-slate-500">
                Bloqueiam apenas a faixa de horário informada
              </p>
            </Card>
          </div>

          <Card>
            <div className="card-header">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <Select
                  value={filtroServidor}
                  onChange={(event) => setFiltroServidor(event.target.value)}
                  className="w-[230px]"
                >
                  <option value="todos">Todos os servidores</option>
                  {servidores.map((servidor) => (
                    <option key={servidor.id} value={servidor.id}>
                      {servidor.nome}
                    </option>
                  ))}
                </Select>
                <Select
                  value={filtroTipo}
                  onChange={(event) => setFiltroTipo(event.target.value)}
                  className="w-[200px]"
                >
                  <option value="todos">Todos os tipos</option>
                  {AUSENCIA_TIPOS.map((tipo) => (
                    <option key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={filtroStatus}
                  onChange={(event) => setFiltroStatus(event.target.value)}
                  className="w-[170px]"
                >
                  <option value="ATIVA">Somente ativas</option>
                  <option value="CANCELADA">Somente canceladas</option>
                  <option value="todas">Todas</option>
                </Select>
              </div>
              <Badge tone="brand">{ausencias.length} registros</Badge>
            </div>

            {carregando ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : ausencias.length === 0 ? (
              <EmptyState
                title="Nenhuma ausência registrada"
                description="Registre férias, licença saúde, licença-prêmio, orientação técnica, atestados e demais afastamentos — totais ou parciais."
                icon={<UsersIcon className="h-6 w-6" />}
                action={
                  <Button variant="outline" onClick={abrirNovaAusencia}>
                    <PlusIcon className="h-4 w-4" /> Registrar ausência
                  </Button>
                }
              />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <th>Servidor</th>
                    <th>Tipo</th>
                    <th>Período</th>
                    <th>Datas</th>
                    <th>Motivo / documento</th>
                    <th>Situação</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {ausencias.map((ausencia) => {
                    const emCurso =
                      ausencia.status === "ATIVA" &&
                      ausencia.dataInicio <= hoje &&
                      hoje <= ausencia.dataFim;
                    return (
                      <tr key={ausencia.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar nome={ausencia.employeeNome} />
                            <div>
                              <p className="text-[13px] font-bold text-slate-800">
                                {ausencia.employeeNome}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {ausencia.cargo} · Mat. {ausencia.matricula}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge tone={AUSENCIA_TONE[ausencia.tipo] ?? "neutral"}>
                            {AUSENCIA_SHORT[ausencia.tipo] ?? ausencia.tipo}
                          </Badge>
                        </td>
                        <td className="text-[12px] text-slate-600">{absencePeriodLabel(ausencia)}</td>
                        <td className="text-[12px] text-slate-600">
                          {formatDateBR(ausencia.dataInicio)}
                          {ausencia.dataFim !== ausencia.dataInicio
                            ? ` → ${formatDateBR(ausencia.dataFim)}`
                            : ""}
                        </td>
                        <td className="max-w-[260px] text-[12px] text-slate-500">
                          <p>{ausencia.motivo ?? "—"}</p>
                          {ausencia.documento ? (
                            <p className="text-slate-400">{ausencia.documento}</p>
                          ) : null}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge tone={ausencia.status === "ATIVA" ? "success" : "neutral"}>
                              {ausencia.status === "ATIVA" ? "Ativa" : "Cancelada"}
                            </Badge>
                            {emCurso ? <Badge tone="warning">Em curso</Badge> : null}
                          </div>
                        </td>
                        <td>
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => abrirEdicaoAusencia(ausencia)}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-brand-400 hover:text-brand-700"
                              title="Editar ausência"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            {ausencia.status === "ATIVA" ? (
                              <button
                                type="button"
                                onClick={() => cancelarAusencia(ausencia)}
                                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-amber-400 hover:text-amber-600"
                                title="Cancelar ausência (libera o ponto)"
                              >
                                <ClockIcon className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setExcluirAusencia(ausencia)}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
                              title="Excluir ausência"
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
        </>
      )}

      <Modal
        open={feriadoModal}
        onClose={() => setFeriadoModal(false)}
        title={feriadoEditando ? "Editar data do calendário" : "Nova data do calendário"}
        description="Feriados, pontos facultativos, recessos e suspensões podem bloquear o registro de ponto."
        footer={
          <>
            <Button variant="outline" onClick={() => setFeriadoModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvarFeriado}
              loading={salvando}
              disabled={!feriadoForm.data || feriadoForm.nome.trim().length < 3}
            >
              <CheckIcon className="h-4 w-4" /> Salvar data
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data">
              <Input
                type="date"
                value={feriadoForm.data}
                onChange={(event) => setFeriadoForm({ ...feriadoForm, data: event.target.value })}
              />
            </Field>
            <Field label="Tipo">
              <Select
                value={feriadoForm.tipo}
                onChange={(event) => setFeriadoForm({ ...feriadoForm, tipo: event.target.value })}
              >
                {HOLIDAY_TIPOS.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Descrição da data">
            <Input
              value={feriadoForm.nome}
              onChange={(event) => setFeriadoForm({ ...feriadoForm, nome: event.target.value })}
              placeholder="Ex.: Nossa Senhora Aparecida"
            />
          </Field>
          <Field label="Observações">
            <Textarea
              value={feriadoForm.descricao}
              onChange={(event) => setFeriadoForm({ ...feriadoForm, descricao: event.target.value })}
              placeholder="Ex.: feriado nacional; não haverá expediente nem aulas."
            />
          </Field>
          <label className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
            <input
              type="checkbox"
              checked={feriadoForm.bloqueiaPonto}
              onChange={(event) =>
                setFeriadoForm({ ...feriadoForm, bloqueiaPonto: event.target.checked })
              }
              className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600"
            />
            <span>
              Bloquear o registro de ponto nesta data
              <span className="mt-0.5 block text-[11px] font-normal text-amber-700">
                Desmarque para manter a data no calendário escolar sem impedir a batida de ponto.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      <Modal
        open={ausenciaModal}
        onClose={() => setAusenciaModal(false)}
        title={ausenciaEditando ? "Editar ausência" : "Registrar ausência do servidor"}
        description="Ausência total (dias seguidos) ou parcial (faixa de horário em um único dia)."
        footer={
          <>
            <Button variant="outline" onClick={() => setAusenciaModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvarAusencia}
              loading={salvando}
              disabled={!ausenciaForm.employeeId || !ausenciaForm.dataInicio || !ausenciaForm.dataFim}
            >
              <CheckIcon className="h-4 w-4" /> Salvar ausência
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Servidor">
            <Select
              value={ausenciaForm.employeeId}
              onChange={(event) =>
                setAusenciaForm({ ...ausenciaForm, employeeId: event.target.value })
              }
            >
              {servidores.map((servidor) => (
                <option key={servidor.id} value={servidor.id}>
                  {servidor.nome} · Mat. {servidor.matricula}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de ausência">
              <Select
                value={ausenciaForm.tipo}
                onChange={(event) =>
                  setAusenciaForm({ ...ausenciaForm, tipo: event.target.value as AusenciaTipo })
                }
              >
                {AUSENCIA_TIPOS.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Abrangência">
              <Select
                value={ausenciaForm.periodo}
                onChange={(event) =>
                  setAusenciaForm({
                    ...ausenciaForm,
                    periodo: event.target.value as "DIA_INTEIRO" | "PARCIAL",
                  })
                }
              >
                <option value="DIA_INTEIRO">Dia inteiro (padrão)</option>
                <option value="PARCIAL">Parcial — faixa de horas em um único dia</option>
              </Select>
            </Field>
            <Field
              label={ausenciaForm.periodo === "PARCIAL" ? "Dia da ausência" : "Data inicial"}
            >
              <Input
                type="date"
                value={ausenciaForm.dataInicio}
                onChange={(event) =>
                  setAusenciaForm({
                    ...ausenciaForm,
                    dataInicio: event.target.value,
                    ...(ausenciaForm.periodo === "PARCIAL"
                      ? { dataFim: event.target.value }
                      : {}),
                  })
                }
              />
            </Field>
            <Field
              label="Data final"
              hint={ausenciaForm.periodo === "PARCIAL" ? "Ausência parcial dura apenas um dia." : undefined}
            >
              <Input
                type="date"
                value={ausenciaForm.periodo === "PARCIAL" ? ausenciaForm.dataInicio : ausenciaForm.dataFim}
                disabled={ausenciaForm.periodo === "PARCIAL"}
                onChange={(event) =>
                  setAusenciaForm({ ...ausenciaForm, dataFim: event.target.value })
                }
              />
            </Field>
          </div>

          {ausenciaForm.periodo === "PARCIAL" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hora inicial da ausência">
                <Input
                  type="time"
                  value={ausenciaForm.horaInicio}
                  onChange={(event) =>
                    setAusenciaForm({ ...ausenciaForm, horaInicio: event.target.value })
                  }
                />
              </Field>
              <Field label="Hora final da ausência">
                <Input
                  type="time"
                  value={ausenciaForm.horaFim}
                  onChange={(event) =>
                    setAusenciaForm({ ...ausenciaForm, horaFim: event.target.value })
                  }
                />
              </Field>
              <p className="rounded-xl bg-brand-50 px-3.5 py-3 text-[12px] text-brand-800 ring-1 ring-inset ring-brand-100 sm:col-span-2">
                No dia informado o servidor ficará impedido de registrar ponto entre{" "}
                <strong className="font-mono">{ausenciaForm.horaInicio}</strong> e{" "}
                <strong className="font-mono">{ausenciaForm.horaFim}</strong>. As horas previstas
                desse intervalo são descontadas do cálculo do dia.
              </p>
            </div>
          ) : (
            <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-200">
              <AlertIcon className="mr-1.5 inline h-4 w-4" />
              Nos dias do período o servidor não poderá registrar ponto e os dias serão tratados como
              ausência justificada (sem falta) nos relatórios.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Documento de referência" hint="Nº do processo, ofício ou atestado.">
              <Input
                value={ausenciaForm.documento}
                onChange={(event) =>
                  setAusenciaForm({ ...ausenciaForm, documento: event.target.value })
                }
                placeholder="Ex.: Atestado nº 4471/2026"
              />
            </Field>
            <Field label="Motivo / observação">
              <Input
                value={ausenciaForm.motivo}
                onChange={(event) => setAusenciaForm({ ...ausenciaForm, motivo: event.target.value })}
                placeholder="Ex.: licença homologada por perícia médica"
              />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(excluirFeriado)}
        onClose={() => setExcluirFeriado(null)}
        onConfirm={confirmarExclusoes}
        loading={salvando}
        title={`Excluir ${excluirFeriado?.nome ?? "data"}`}
        message={`A data ${formatDateBR(
          excluirFeriado?.data ?? "",
        )} deixará de constar no calendário escolar e o registro de ponto voltará a ser liberado. Deseja continuar?`}
        confirmLabel="Excluir data"
      />

      <ConfirmDialog
        open={Boolean(excluirAusencia)}
        onClose={() => setExcluirAusencia(null)}
        onConfirm={confirmarExclusoes}
        loading={salvando}
        title="Excluir ausência"
        message={`A ausência de ${excluirAusencia?.employeeNome ?? "servidor"} (${
          excluirAusencia ? AUSENCIA_SHORT[excluirAusencia.tipo] : ""
        }) será excluída permanentemente. Prefira cancelar para manter o histórico.`}
        confirmLabel="Excluir ausência"
      />
    </div>
  );
}
