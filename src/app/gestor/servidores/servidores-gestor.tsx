"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { WEEKDAYS, computeWorkedMinutes, formatDateBR, formatDuration } from "@/lib/time";

type Horario = {
  diaSemana: number;
  trabalha: boolean;
  entrada: string | null;
  saidaAlmoco: string | null;
  retornoAlmoco: string | null;
  saidaExpediente: string | null;
  toleranciaMin: number;
};

type Servidor = {
  id: number;
  matricula: string;
  nome: string;
  cpf: string | null;
  rg: string | null;
  categoria: string;
  email: string | null;
  telefone: string | null;
  cargo: string;
  vinculo: string;
  jornadaId: number | null;
  jornadaNome: string | null;
  dataAdmissao: string | null;
  observacoes: string | null;
  ativo: boolean;
  usuarioId: number | null;
  usuarioAtivo: boolean | null;
  horarios: Horario[];
  diasTrabalho: number[];
  cargaSemanalMin: number;
};

type Jornada = {
  id: number;
  nome: string;
  ativo: boolean;
  entrada: string;
  saidaAlmoco: string | null;
  retornoAlmoco: string | null;
  saidaExpediente: string;
  toleranciaMin: number;
  diasSemana: number[];
};

type WeekDraft = {
  diaSemana: number;
  trabalha: boolean;
  entrada: string;
  saidaAlmoco: string;
  retornoAlmoco: string;
  saidaExpediente: string;
  toleranciaMin: string;
};

const VINCULOS = [
  { value: "EFETIVO", label: "Efetivo" },
  { value: "TEMPORARIO", label: "Temporário" },
  { value: "TERCEIRIZADO", label: "Terceirizado" },
  { value: "ESTAGIARIO", label: "Estagiário" },
];

const TIME_KEYS: (keyof WeekDraft)[] = [
  "entrada",
  "saidaAlmoco",
  "retornoAlmoco",
  "saidaExpediente",
];

function emptyDay(diaSemana: number, trabalha = false): WeekDraft {
  return {
    diaSemana,
    trabalha,
    entrada: trabalha ? "07:00" : "",
    saidaAlmoco: "",
    retornoAlmoco: "",
    saidaExpediente: trabalha ? "17:00" : "",
    toleranciaMin: "10",
  };
}

function defaultWeek(): WeekDraft[] {
  return WEEKDAYS.map((dia) => emptyDay(dia.iso, dia.iso <= 5));
}

function toDraft(horarios: Horario[]): WeekDraft[] {
  return WEEKDAYS.map((dia) => {
    const found = horarios.find((item) => item.diaSemana === dia.iso);
    if (!found) return emptyDay(dia.iso);
    return {
      diaSemana: dia.iso,
      trabalha: found.trabalha,
      entrada: found.entrada?.slice(0, 5) ?? "",
      saidaAlmoco: found.saidaAlmoco?.slice(0, 5) ?? "",
      retornoAlmoco: found.retornoAlmoco?.slice(0, 5) ?? "",
      saidaExpediente: found.saidaExpediente?.slice(0, 5) ?? "",
      toleranciaMin: String(found.toleranciaMin ?? 10),
    };
  });
}

function weeklyMinutes(week: WeekDraft[]): { dias: number; minutos: number } {
  let dias = 0;
  let minutos = 0;
  week.forEach((dia) => {
    if (!dia.trabalha || !dia.entrada || !dia.saidaExpediente) return;
    dias += 1;
    minutos += computeWorkedMinutes({
      ENTRADA: dia.entrada,
      SAIDA_ALMOCO: dia.saidaAlmoco || null,
      RETORNO_ALMOCO: dia.retornoAlmoco || null,
      SAIDA_EXPEDIENTE: dia.saidaExpediente,
    });
  });
  return { dias, minutos };
}

const CATEGORIAS_FORM = [
  { value: "EFETIVO", label: "Titular de Cargo (Efetivo)" },
  { value: "ATIVO_FUNCAO", label: "Ocupante de Função-Atividade" },
  { value: "ACT", label: "Admitido em Caráter Temporário (ACT)" },
  { value: "TERCEIRIZADO", label: "Serviço terceirizado" },
  { value: "ESTAGIARIO", label: "Estagiário" },
];

const emptyForm = {
  nome: "",
  matricula: "",
  cpf: "",
  rg: "",
  categoria: "EFETIVO",
  email: "",
  telefone: "",
  cargo: "",
  vinculo: "EFETIVO",
  jornadaId: "",
  dataAdmissao: "",
  observacoes: "",
  ativo: true,
  criarAcesso: true,
  senhaAcesso: "",
  novaSenha: "",
};

export function ServidoresGestor() {
  const toast = useToast();
  const [servidores, setServidores] = useState<Servidor[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("ativos");
  const [carregando, setCarregando] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Servidor | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [semana, setSemana] = useState<WeekDraft[]>(defaultWeek());
  const [modeloSelecionado, setModeloSelecionado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<Servidor | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [servidoresData, jornadasData] = await Promise.all([
        apiFetch<{ servidores: Servidor[] }>(
          `/api/servidores?busca=${encodeURIComponent(busca)}&status=${status}`,
        ),
        apiFetch<{ jornadas: Jornada[] }>("/api/jornadas"),
      ]);
      setServidores(servidoresData.servidores);
      setJornadas(jornadasData.jornadas);
    } catch (error) {
      toast.error("Falha ao carregar servidores", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [busca, status, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void carregar(), 220);
    return () => window.clearTimeout(timer);
  }, [carregar]);

  const resumo = useMemo(
    () => ({
      total: servidores.length,
      ativos: servidores.filter((servidor) => servidor.ativo).length,
      semHorario: servidores.filter((servidor) => servidor.diasTrabalho.length === 0).length,
      semAcesso: servidores.filter((servidor) => !servidor.usuarioId).length,
    }),
    [servidores],
  );

  const semanal = useMemo(() => weeklyMinutes(semana), [semana]);

  const abrirNovo = () => {
    setEditando(null);
    setForm({ ...emptyForm });
    setSemana(defaultWeek());
    setModeloSelecionado("");
    setModalOpen(true);
  };

  const abrirEdicao = (servidor: Servidor) => {
    setEditando(servidor);
    setForm({
      nome: servidor.nome,
      matricula: servidor.matricula,
      cpf: servidor.cpf ?? "",
      rg: servidor.rg ?? "",
      categoria: servidor.categoria ?? "EFETIVO",
      email: servidor.email ?? "",
      telefone: servidor.telefone ?? "",
      cargo: servidor.cargo,
      vinculo: servidor.vinculo,
      jornadaId: servidor.jornadaId ? String(servidor.jornadaId) : "",
      dataAdmissao: servidor.dataAdmissao ?? "",
      observacoes: servidor.observacoes ?? "",
      ativo: servidor.ativo,
      criarAcesso: Boolean(servidor.usuarioId),
      senhaAcesso: "",
      novaSenha: "",
    });
    setSemana(toDraft(servidor.horarios ?? []));
    setModeloSelecionado(servidor.jornadaId ? String(servidor.jornadaId) : "");
    setModalOpen(true);
  };

  const aplicarModelo = () => {
    const modelo = jornadas.find((item) => String(item.id) === modeloSelecionado);
    if (!modelo) {
      toast.error("Selecione um modelo", "Escolha um modelo de jornada para aplicar como base.");
      return;
    }
    setSemana(
      WEEKDAYS.map((dia) => {
        const trabalha = modelo.diasSemana.includes(dia.iso);
        return {
          diaSemana: dia.iso,
          trabalha,
          entrada: trabalha ? modelo.entrada.slice(0, 5) : "",
          saidaAlmoco: trabalha ? modelo.saidaAlmoco?.slice(0, 5) ?? "" : "",
          retornoAlmoco: trabalha ? modelo.retornoAlmoco?.slice(0, 5) ?? "" : "",
          saidaExpediente: trabalha ? modelo.saidaExpediente.slice(0, 5) : "",
          toleranciaMin: String(modelo.toleranciaMin ?? 10),
        };
      }),
    );
    setForm((current) => ({ ...current, jornadaId: String(modelo.id) }));
    toast.push({
      kind: "info",
      title: `Modelo "${modelo.nome}" aplicado`,
      description: "Ajuste os horários de cada dia antes de salvar, se necessário.",
    });
  };

  const replicarDia = (origem: WeekDraft) => {
    setSemana((current) =>
      current.map((dia) =>
        dia.diaSemana === origem.diaSemana
          ? dia
          : dia.trabalha
            ? {
                ...dia,
                entrada: origem.entrada,
                saidaAlmoco: origem.saidaAlmoco,
                retornoAlmoco: origem.retornoAlmoco,
                saidaExpediente: origem.saidaExpediente,
                toleranciaMin: origem.toleranciaMin,
              }
            : dia,
      ),
    );
    toast.push({
      kind: "info",
      title: "Horário replicado",
      description: "Os demais dias marcados como expediente receberam o mesmo horário.",
    });
  };

  const atualizarDia = (diaSemana: number, patch: Partial<WeekDraft>) => {
    setSemana((current) =>
      current.map((dia) => (dia.diaSemana === diaSemana ? { ...dia, ...patch } : dia)),
    );
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        nome: form.nome,
        matricula: form.matricula,
        cpf: form.cpf,
        rg: form.rg,
        categoria: form.categoria,
        email: form.email,
        telefone: form.telefone,
        cargo: form.cargo,
        vinculo: form.vinculo,
        jornadaId: form.jornadaId ? Number(form.jornadaId) : null,
        dataAdmissao: form.dataAdmissao || null,
        observacoes: form.observacoes,
        ativo: form.ativo,
        horarios: semana.map((dia) => ({
          diaSemana: dia.diaSemana,
          trabalha: dia.trabalha,
          entrada: dia.trabalha ? dia.entrada : "",
          saidaAlmoco: dia.trabalha ? dia.saidaAlmoco : "",
          retornoAlmoco: dia.trabalha ? dia.retornoAlmoco : "",
          saidaExpediente: dia.trabalha ? dia.saidaExpediente : "",
          toleranciaMin: Number(dia.toleranciaMin || 10),
        })),
      };

      if (editando) {
        if (form.novaSenha) payload.novaSenha = form.novaSenha;
        await apiFetch(`/api/servidores/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Cadastro atualizado", `Horário de ${form.nome} salvo com sucesso.`);
      } else {
        payload.criarAcesso = form.criarAcesso;
        if (form.criarAcesso) payload.senhaAcesso = form.senhaAcesso;
        await apiFetch("/api/servidores", { method: "POST", body: JSON.stringify(payload) });
        toast.success(
          "Servidor cadastrado",
          `${semanal.dias} dia(s) de expediente · ${formatDuration(semanal.minutos)} semanais.`,
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
      await apiFetch(`/api/servidores/${excluir.id}`, { method: "DELETE" });
      toast.success("Cadastro excluído", `${excluir.nome} e seus registros foram removidos.`);
      setExcluir(null);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível excluir", (error as Error).message);
    } finally {
      setExcluindo(false);
    }
  };

  const podeSalvar =
    form.nome.trim().length > 2 &&
    form.matricula.trim().length > 2 &&
    form.cargo.trim().length > 1 &&
    (editando ? true : !form.criarAcesso || form.senhaAcesso.length >= 8);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Cadastro de servidores"
        description="Cada servidor tem o seu próprio horário de trabalho, podendo variar a cada dia da semana."
        action={
          <Button onClick={abrirNovo}>
            <PlusIcon className="h-4 w-4" /> Novo servidor
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Servidores listados
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{resumo.total}</p>
          <p className="mt-1 text-xs text-slate-500">{resumo.ativos} com cadastro ativo</p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Sem horário definido
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{resumo.semHorario}</p>
          <p className="mt-1 text-xs text-slate-500">Informe o horário individual do servidor</p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Sem acesso ao sistema
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{resumo.semAcesso}</p>
          <p className="mt-1 text-xs text-slate-500">Cadastre login e senha para o servidor</p>
        </Card>
        <Card className="flex flex-col justify-between p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Modelos de apoio
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{jornadas.length}</p>
          <p className="mt-1 text-xs text-slate-500">
            <Link href="/gestor/jornadas" className="text-brand-600 hover:underline">
              Gerenciar modelos de jornada
            </Link>
          </p>
        </Card>
      </div>

      <Card>
        <div className="card-header">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por nome, matrícula, cargo ou e-mail"
                className="input pl-9"
              />
            </div>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-[170px]"
            >
              <option value="ativos">Somente ativos</option>
              <option value="inativos">Somente inativos</option>
              <option value="todos">Todos os cadastros</option>
            </Select>
          </div>
          <Badge tone="brand">{servidores.length} registros</Badge>
        </div>

        {carregando ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : servidores.length === 0 ? (
          <EmptyState
            title="Nenhum servidor encontrado"
            description="Ajuste os filtros de busca ou cadastre um novo servidor da unidade."
            icon={<UsersIcon className="h-6 w-6" />}
            action={
              <Button variant="outline" onClick={abrirNovo}>
                <PlusIcon className="h-4 w-4" /> Cadastrar servidor
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>Servidor</th>
                <th>Horário de trabalho</th>
                <th>Carga semanal</th>
                <th>Contato</th>
                <th>Situação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {servidores.map((servidor) => (
                <tr key={servidor.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar nome={servidor.nome} />
                      <div>
                        <p className="text-[13px] font-bold text-slate-800">{servidor.nome}</p>
                        <p className="text-[11px] text-slate-500">
                          {servidor.cargo} · Mat. {servidor.matricula}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    {servidor.cargaSemanalMin > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {WEEKDAYS.filter((dia) => servidor.diasTrabalho.includes(dia.iso)).map(
                          (dia) => {
                            const horario = servidor.horarios.find(
                              (item) => item.diaSemana === dia.iso,
                            );
                            return (
                              <span
                                key={dia.iso}
                                title={`${dia.long}: ${
                                  horario?.entrada?.slice(0, 5) ?? "--"
                                } às ${horario?.saidaExpediente?.slice(0, 5) ?? "--"}${
                                  horario?.saidaAlmoco
                                    ? ` (intervalo ${horario.saidaAlmoco.slice(0, 5)}–${
                                        horario.retornoAlmoco?.slice(0, 5) ?? "--"
                                      })`
                                    : ""
                                }`}
                                className="rounded-lg bg-brand-50 px-2 py-1 text-[10px] font-bold uppercase text-brand-700 ring-1 ring-inset ring-brand-100"
                              >
                                {dia.short}
                              </span>
                            );
                          },
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] font-semibold text-amber-600">
                        Horário não definido
                      </span>
                    )}
                  </td>
                  <td className="text-[12px] text-slate-600">
                    {servidor.cargaSemanalMin > 0 ? (
                      <>
                        <p className="font-semibold text-slate-700">
                          {formatDuration(servidor.cargaSemanalMin)} / semana
                        </p>
                        <p className="text-slate-400">
                          {servidor.diasTrabalho.length} dia(s) por semana
                        </p>
                      </>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td className="text-[12px] text-slate-600">
                    <p>{servidor.email ?? "--"}</p>
                    <p className="text-slate-400">{servidor.telefone ?? "sem telefone"}</p>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={servidor.ativo ? "success" : "neutral"}>
                        {servidor.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                      <Badge tone={servidor.usuarioId ? "brand" : "warning"}>
                        {servidor.usuarioId ? "Acesso criado" : "Sem acesso"}
                      </Badge>
                    </div>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => abrirEdicao(servidor)}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-brand-400 hover:text-brand-700"
                        title="Editar cadastro e horário"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExcluir(servidor)}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
                        title="Excluir cadastro"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? `Editar ${editando.nome}` : "Cadastrar novo servidor"}
        description="Dados cadastrais, horário de trabalho individual e credenciais de acesso."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={salvando} disabled={!podeSalvar}>
              <CheckIcon className="h-4 w-4" />{" "}
              {editando ? "Salvar alterações" : "Cadastrar servidor"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" className="sm:col-span-2">
              <Input
                value={form.nome}
                onChange={(event) => setForm({ ...form, nome: event.target.value })}
                placeholder="Ex.: Ana Paula Souza"
              />
            </Field>
            <Field label="Matrícula">
              <Input
                value={form.matricula}
                onChange={(event) => setForm({ ...form, matricula: event.target.value })}
                placeholder="Ex.: MFS-10234"
              />
            </Field>
            <Field label="RG" hint="Documento exigido no Livro Ponto.">
              <Input
                value={form.rg}
                onChange={(event) => setForm({ ...form, rg: event.target.value })}
                placeholder="Ex.: 12.345.678-9 SSP/SP"
              />
            </Field>
            <Field label="CPF">
              <Input
                value={form.cpf}
                onChange={(event) => setForm({ ...form, cpf: event.target.value })}
                placeholder="000.000.000-00"
              />
            </Field>
            <Field label="Categoria funcional" hint="Consta na identificação do Livro Ponto.">
              <Select
                value={form.categoria}
                onChange={(event) => setForm({ ...form, categoria: event.target.value })}
              >
                {CATEGORIAS_FORM.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Função / cargo">
              <Input
                value={form.cargo}
                onChange={(event) => setForm({ ...form, cargo: event.target.value })}
                placeholder="Ex.: Professora de Matemática"
              />
            </Field>
            <Field label="Vínculo">
              <Select
                value={form.vinculo}
                onChange={(event) => setForm({ ...form, vinculo: event.target.value })}
              >
                {VINCULOS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Data de admissão">
              <Input
                type="date"
                value={form.dataAdmissao}
                onChange={(event) => setForm({ ...form, dataAdmissao: event.target.value })}
              />
            </Field>
            <Field label="Telefone">
              <Input
                value={form.telefone}
                onChange={(event) => setForm({ ...form, telefone: event.target.value })}
                placeholder="(11) 90000-0000"
              />
            </Field>
            <Field
              label="E-mail institucional"
              hint="Usado como login. Se vazio, geramos automaticamente."
              className="sm:col-span-2"
            >
              <Input
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="nome@marlenefrattini.sp.gov.br"
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ClockIcon className="h-4 w-4 text-brand-600" />
                <div>
                  <p className="text-[13px] font-bold text-slate-700">
                    Horário de trabalho individual
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Marque os dias de expediente e informe os horários — cada dia pode ser diferente.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Modelo de apoio" className="w-[210px]">
                  <Select
                    value={modeloSelecionado}
                    onChange={(event) => setModeloSelecionado(event.target.value)}
                  >
                    <option value="">Selecione um modelo…</option>
                    {jornadas.map((jornada) => (
                      <option key={jornada.id} value={jornada.id}>
                        {jornada.nome}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button variant="outline" size="sm" onClick={aplicarModelo}>
                  Aplicar modelo
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {semana.map((dia) => {
                const info = WEEKDAYS.find((item) => item.iso === dia.diaSemana);
                const pausaAtiva = Boolean(dia.saidaAlmoco && dia.retornoAlmoco);
                return (
                  <div
                    key={dia.diaSemana}
                    className={`rounded-xl border p-3 transition ${
                      dia.trabalha
                        ? "border-brand-200 bg-white"
                        : "border-slate-200 bg-white/60 opacity-80"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <label className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={dia.trabalha}
                          onChange={(event) =>
                            atualizarDia(dia.diaSemana, {
                              trabalha: event.target.checked,
                              ...(event.target.checked
                                ? {
                                    entrada: dia.entrada || "07:00",
                                    saidaExpediente: dia.saidaExpediente || "17:00",
                                  }
                                : {}),
                            })
                          }
                          className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                        <span className="w-[110px] text-[13px] font-bold text-slate-700">
                          {info?.long}
                        </span>
                      </label>

                      {dia.trabalha ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                            Entrada
                            <input
                              type="time"
                              value={dia.entrada}
                              onChange={(event) =>
                                atualizarDia(dia.diaSemana, { entrada: event.target.value })
                              }
                              className="input h-9 w-[112px] py-0 text-[13px]"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                            Saída almoço
                            <input
                              type="time"
                              value={dia.saidaAlmoco}
                              onChange={(event) =>
                                atualizarDia(dia.diaSemana, { saidaAlmoco: event.target.value })
                              }
                              className="input h-9 w-[112px] py-0 text-[13px]"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                            Retorno
                            <input
                              type="time"
                              value={dia.retornoAlmoco}
                              onChange={(event) =>
                                atualizarDia(dia.diaSemana, { retornoAlmoco: event.target.value })
                              }
                              className="input h-9 w-[112px] py-0 text-[13px]"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                            Saída
                            <input
                              type="time"
                              value={dia.saidaExpediente}
                              onChange={(event) =>
                                atualizarDia(dia.diaSemana, { saidaExpediente: event.target.value })
                              }
                              className="input h-9 w-[112px] py-0 text-[13px]"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                            Tolerância
                            <select
                              value={dia.toleranciaMin}
                              onChange={(event) =>
                                atualizarDia(dia.diaSemana, { toleranciaMin: event.target.value })
                              }
                              className="input h-9 w-[92px] cursor-pointer py-0 text-[13px]"
                            >
                              {[0, 5, 10, 15, 20, 30].map((value) => (
                                <option key={value} value={value}>
                                  {value} min
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => replicarDia(dia)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-brand-400 hover:text-brand-700"
                            title="Replicar este horário para os demais dias de expediente"
                          >
                            Replicar
                          </button>
                          {!pausaAtiva ? (
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">
                              2 batidas
                            </span>
                          ) : (
                            <span className="rounded-lg bg-accent-50 px-2 py-1 text-[10px] font-bold uppercase text-accent-700">
                              4 batidas
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Sem expediente
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3 text-[13px] text-brand-800 ring-1 ring-inset ring-brand-100">
              <span className="inline-flex items-center gap-2 font-semibold">
                <CalendarIcon className="h-4 w-4" /> Resumo da semana
              </span>
              <span className="font-mono font-bold">
                {semanal.dias} dia(s) · {formatDuration(semanal.minutos)}
                {semanal.dias > 0
                  ? ` · média ${formatDuration(Math.round(semanal.minutos / semanal.dias))}/dia`
                  : ""}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2.5">
              <AlertIcon className="h-4 w-4 text-brand-600" />
              <p className="text-[13px] font-bold text-slate-700">Acesso ao sistema</p>
            </div>
            {editando ? (
              <Field
                label="Redefinir senha de acesso"
                hint={`Servidor ${
                  editando.usuarioId ? "possui acesso criado" : "ainda não possui acesso"
                }. Informe uma nova senha para redefinir.`}
                className="mt-3"
              >
                <Input
                  value={form.novaSenha}
                  onChange={(event) => setForm({ ...form, novaSenha: event.target.value })}
                  placeholder="Mínimo de 8 caracteres (deixe vazio para manter)"
                />
              </Field>
            ) : (
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.criarAcesso}
                    onChange={(event) =>
                      setForm({ ...form, criarAcesso: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  Criar login e senha para o servidor acessar a área exclusiva
                </label>
                {form.criarAcesso ? (
                  <Field label="Senha inicial de acesso" hint="Mínimo de 8 caracteres.">
                    <Input
                      value={form.senhaAcesso}
                      onChange={(event) =>
                        setForm({ ...form, senhaAcesso: event.target.value })
                      }
                      placeholder="Ex.: Servidor@2025"
                    />
                  </Field>
                ) : null}
              </div>
            )}
          </div>

          <Field label="Observações">
            <Textarea
              value={form.observacoes}
              onChange={(event) => setForm({ ...form, observacoes: event.target.value })}
              placeholder="Informações complementares sobre a jornada ou o servidor."
            />
          </Field>

          <label className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(event) => setForm({ ...form, ativo: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Cadastro ativo (permite registrar ponto)
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(excluir)}
        onClose={() => setExcluir(null)}
        onConfirm={confirmarExclusao}
        loading={excluindo}
        title={`Excluir ${excluir?.nome ?? "servidor"}`}
        message={`Todos os registros de ponto, o horário de trabalho${
          excluir?.dataAdmissao ? ` (admissão ${formatDateBR(excluir.dataAdmissao)})` : ""
        } e o acesso ao sistema deste servidor serão excluídos permanentemente. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir definitivamente"
      />
    </div>
  );
}
