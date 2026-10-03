"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/icons";
import {
  JustificarFaltaModal,
  type JustificativaAlvo,
} from "@/components/justificar-falta-modal";
import { useToast } from "@/components/toast";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SectionTitle,
  Select,
  StatCard,
  TableWrap,
} from "@/components/ui";
import { apiFetch, downloadFile } from "@/lib/client";
import {
  formatDateBR,
  formatDuration,
  formatSigned,
  monthLabel,
  todayISO,
  weekdayLabel,
  dayOfWeek,
} from "@/lib/time";

type StatusConferencia =
  | "COMPLETO"
  | "PARCIAL"
  | "SEM_REGISTRO"
  | "AGUARDANDO"
  | "AUSENCIA"
  | "FERIADO"
  | "SEM_EXPEDIENTE"
  | "EXTRA";

type Tone = "success" | "warning" | "danger" | "neutral" | "info" | "brand";

type ConferenciaDia = {
  employeeId: number;
  nome: string;
  cargo: string;
  matricula: string;
  modeloNome: string | null;
  status: StatusConferencia;
  statusLabel: string;
  batidas: { tipo: string; label: string; hora: string | null }[];
  registradas: number;
  previstas: number;
  horarioLabel: string;
  ausencia: string | null;
  feriado: string | null;
  workedMinutes: number;
  expectedMinutes: number;
  saldo: number;
  atraso: boolean;
};

type ConferenciaMesLinha = {
  employeeId: number;
  nome: string;
  cargo: string;
  matricula: string;
  modeloNome: string | null;
  diasPrevistos: number;
  completos: number;
  parciais: number;
  semRegistro: number;
  aguardando: number;
  ausencias: number;
  feriados: number;
  extras: number;
  atrasos: number;
  totalMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
  diasComProblema: { data: string; status: StatusConferencia; label: string }[];
};

type Resposta = {
  data: string;
  mes: string;
  hoje: string;
  mesLabel: string;
  dataLabel: string;
  dia: ConferenciaDia[];
  mesLinhas: ConferenciaMesLinha[];
  resumoDia: Record<StatusConferencia, number> & { servidores: number };
  resumoMes: {
    servidores: number;
    diasPrevistos: number;
    completos: number;
    parciais: number;
    semRegistro: number;
    ausencias: number;
    feriados: number;
    extras: number;
    atrasos: number;
    totalMinutos: number;
    esperadoMinutos: number;
    saldoMinutos: number;
  };
  status: Record<StatusConferencia, { label: string; tone: Tone }>;
};

const FILTROS: { id: StatusConferencia | "TODOS" | "PENDENCIAS"; label: string }[] = [
  { id: "TODOS", label: "Todos" },
  { id: "PENDENCIAS", label: "Com pendência" },
  { id: "COMPLETO", label: "Registro total" },
  { id: "PARCIAL", label: "Parcial" },
  { id: "SEM_REGISTRO", label: "Não registrou" },
  { id: "AGUARDANDO", label: "Aguardando" },
  { id: "AUSENCIA", label: "Ausência" },
  { id: "FERIADO", label: "Feriado" },
  { id: "SEM_EXPEDIENTE", label: "Sem expediente" },
];

export function ConferenciaGestor({ mesInicial }: { mesInicial: string }) {
  const toast = useToast();
  const [aba, setAba] = useState<"dia" | "mes">("dia");
  const [data, setData] = useState(todayISO());
  const [mes, setMes] = useState(mesInicial);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("TODOS");
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [justificar, setJustificar] = useState<JustificativaAlvo | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await apiFetch<Resposta>(`/api/conferencia?mes=${mes}&data=${data}`);
      setDados(resposta);
    } catch (error) {
      const message = (error as Error).message;
      setErro(message);
      toast.error("Falha ao carregar a conferência", message);
    } finally {
      setCarregando(false);
    }
  }, [mes, data, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Ao trocar o mês, mantém a data coerente (mesmo dia ou dia 1).
  useEffect(() => {
    if (data.slice(0, 7) === mes) return;
    const dia = data.slice(8, 10);
    setData(`${mes}-${dia}`);
  }, [mes]); // eslint-disable-line react-hooks/exhaustive-deps

  const diaFiltrado = useMemo(() => {
    let lista = dados?.dia ?? [];
    if (busca.trim()) {
      const termo = busca.toLowerCase();
      lista = lista.filter(
        (item) =>
          item.nome.toLowerCase().includes(termo) ||
          item.matricula.toLowerCase().includes(termo) ||
          item.cargo.toLowerCase().includes(termo),
      );
    }
    if (filtro === "TODOS") return lista;
    if (filtro === "PENDENCIAS") {
      return lista.filter((item) => item.status === "PARCIAL" || item.status === "SEM_REGISTRO");
    }
    return lista.filter((item) => item.status === filtro);
  }, [dados, busca, filtro]);

  const mesFiltrado = useMemo(() => {
    const lista = dados?.mesLinhas ?? [];
    if (!busca.trim()) return lista;
    const termo = busca.toLowerCase();
    return lista.filter(
      (item) =>
        item.nome.toLowerCase().includes(termo) ||
        item.matricula.toLowerCase().includes(termo) ||
        item.cargo.toLowerCase().includes(termo),
    );
  }, [dados, busca]);

  const exportar = async () => {
    try {
      await downloadFile(
        `/api/conferencia?mes=${mes}&data=${data}&formato=csv`,
        `conferencia-ponto-${mes}.csv`,
      );
      toast.success("Relatório exportado", "A planilha traz a situação do dia e o consolidado do mês.");
    } catch (error) {
      toast.error("Não foi possível exportar", (error as Error).message);
    }
  };

  const meta = dados?.status;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Conferência de frequência"
        description="Verifique quem registrou o ponto por completo, parcialmente ou não registrou — no dia e no mês."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              type="date"
              value={data}
              onChange={(event) => {
                const valor = event.target.value || todayISO();
                setData(valor);
                setMes(valor.slice(0, 7));
              }}
              className="w-[170px]"
            />
            <Input
              type="month"
              value={mes}
              onChange={(event) => setMes(event.target.value || mesInicial)}
              className="w-[160px]"
            />
            <Button variant="outline" onClick={exportar}>
              <DownloadIcon className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button
              variant="accent"
              onClick={() =>
                setJustificar({
                  employeeId: 0,
                  nome: "",
                  data: dados?.data ?? data,
                })
              }
              disabled={!dados || dados.dia.length === 0}
            >
              <CheckIcon className="h-4 w-4" /> Justificar falta
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2.5">
        {(
          [
            { id: "dia" as const, label: "Situação do dia", icon: CalendarIcon },
            { id: "mes" as const, label: "Consolidado do mês", icon: UsersIcon },
          ]
        ).map((item) => {
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
            </button>
          );
        })}
      </div>

      {erro ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4">
          <p className="text-[13px] font-semibold text-amber-900">
            Não foi possível carregar a conferência: {erro}
          </p>
          <Button size="sm" variant="outline" onClick={() => void carregar()}>
            Tentar novamente
          </Button>
        </Card>
      ) : null}

      {aba === "dia" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Registro total"
              value={dados?.resumoDia.COMPLETO ?? "--"}
              hint={dados ? `${dados.dataLabel}` : ""}
              tone="success"
              icon={<CheckIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Registro parcial"
              value={dados?.resumoDia.PARCIAL ?? "--"}
              hint="Batidas faltando no dia"
              tone={(dados?.resumoDia.PARCIAL ?? 0) > 0 ? "warning" : "success"}
              icon={<ClockIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Não registraram"
              value={dados?.resumoDia.SEM_REGISTRO ?? "--"}
              hint={`${dados?.resumoDia.AGUARDANDO ?? 0} aguardando (dia em curso)`}
              tone={(dados?.resumoDia.SEM_REGISTRO ?? 0) > 0 ? "danger" : "success"}
              icon={<AlertIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Ausências e feriados"
              value={`${dados?.resumoDia.AUSENCIA ?? 0} / ${dados?.resumoDia.FERIADO ?? 0}`}
              hint={`${dados?.resumoDia.SEM_EXPEDIENTE ?? 0} sem expediente`}
              tone="brand"
              icon={<CalendarIcon className="h-[18px] w-[18px]" />}
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
                    placeholder="Buscar servidor, matrícula ou cargo"
                    className="input pl-9"
                  />
                </div>
                <Select
                  value={filtro}
                  onChange={(event) => setFiltro(event.target.value as typeof filtro)}
                  className="w-[210px]"
                >
                  {FILTROS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Badge tone="brand">
                {dados ? `${weekdayLabel(dayOfWeek(dados.data), true)} · ${formatDateBR(dados.data)}` : ""}
              </Badge>
            </div>

            {carregando ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : diaFiltrado.length === 0 ? (
              <EmptyState
                title="Nenhum servidor neste filtro"
                description="Ajuste o filtro de situação ou a busca para ver outros servidores."
                icon={<UsersIcon className="h-6 w-6" />}
              />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <th>Servidor</th>
                    <th>Horário do dia</th>
                    <th>Batidas registradas</th>
                    <th>Apurado</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {diaFiltrado.map((item) => {
                    const info = meta?.[item.status];
                    return (
                      <tr key={item.employeeId}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar nome={item.nome} />
                            <div>
                              <p className="text-[13px] font-bold text-slate-800">{item.nome}</p>
                              <p className="text-[11px] text-slate-500">
                                {item.cargo} · Mat. {item.matricula}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="text-[12px] text-slate-600">{item.horarioLabel}</td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            {item.batidas.length === 0 ? (
                              <span className="text-[12px] text-slate-400">—</span>
                            ) : (
                              item.batidas.map((batida) => (
                                <span
                                  key={batida.tipo}
                                  title={batida.label}
                                  className={`rounded-lg px-2 py-1 text-[10px] font-bold ring-1 ring-inset ${
                                    batida.hora
                                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                      : "bg-rose-50 text-rose-600 ring-rose-200"
                                  }`}
                                >
                                  {batida.hora ?? "faltou"}
                                </span>
                              ))
                            )}
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {item.registradas} de {item.previstas} batidas previstas
                          </p>
                        </td>
                        <td className="text-[12px]">
                          <p className="font-semibold text-slate-700">
                            {formatDuration(item.workedMinutes)}
                          </p>
                          <p className="text-slate-400">
                            previsto {formatDuration(item.expectedMinutes)}
                          </p>
                        </td>
                        <td>
                          <div className="flex flex-col items-start gap-1.5">
                            <Badge tone={info?.tone ?? "neutral"}>{item.statusLabel}</Badge>
                            {item.ausencia ? (
                              <span className="text-[11px] font-semibold text-brand-700">
                                {item.ausencia}
                              </span>
                            ) : null}
                            {item.feriado ? (
                              <span className="text-[11px] font-semibold text-slate-500">
                                {item.feriado}
                              </span>
                            ) : null}
                            {item.atraso ? <Badge tone="warning">Atraso</Badge> : null}
                            {item.status === "SEM_REGISTRO" ||
                            item.status === "PARCIAL" ||
                            item.status === "AGUARDANDO" ? (
                              <Button
                                size="sm"
                                variant={item.status === "SEM_REGISTRO" ? "accent" : "outline"}
                                onClick={() =>
                                  setJustificar({
                                    employeeId: item.employeeId,
                                    nome: item.nome,
                                    cargo: item.cargo,
                                    matricula: item.matricula,
                                    data: dados?.data ?? data,
                                    tipoSugerido:
                                      item.registradas === 0 ? "DIA_INTEIRO" : "PARCIAL",
                                    faltantes: item.batidas
                                      .filter((batida) => !batida.hora)
                                      .map((batida) => batida.label),
                                  })
                                }
                              >
                                <CheckIcon className="h-3.5 w-3.5" /> Justificar falta
                              </Button>
                            ) : null}
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
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={`Dias apurados em ${monthLabel(mes)}`}
              value={dados?.resumoMes.diasPrevistos ?? "--"}
              hint={`${dados?.resumoMes.servidores ?? 0} servidores ativos`}
              tone="info"
              icon={<CalendarIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Registros totais"
              value={dados?.resumoMes.completos ?? "--"}
              hint={`${dados?.resumoMes.parciais ?? 0} parciais`}
              tone="success"
              icon={<CheckIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Dias sem registro"
              value={dados?.resumoMes.semRegistro ?? "--"}
              hint="Dias de expediente sem nenhuma batida"
              tone={(dados?.resumoMes.semRegistro ?? 0) > 0 ? "danger" : "success"}
              icon={<AlertIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Ausências / feriados"
              value={`${dados?.resumoMes.ausencias ?? 0} / ${dados?.resumoMes.feriados ?? 0}`}
              hint={`${dados?.resumoMes.extras ?? 0} dia(s) extra · ${dados?.resumoMes.atrasos ?? 0} atraso(s)`}
              tone="brand"
              icon={<UsersIcon className="h-[18px] w-[18px]" />}
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
                    placeholder="Buscar servidor, matrícula ou cargo"
                    className="input pl-9"
                  />
                </div>
                <Badge tone="brand">{monthLabel(mes)}</Badge>
              </div>
            </div>

            {carregando ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : mesFiltrado.length === 0 ? (
              <EmptyState
                title="Nenhum servidor ativo"
                description="Cadastre os servidores para acompanhar a frequência do mês."
                icon={<UsersIcon className="h-6 w-6" />}
              />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <th>Servidor</th>
                    <th>Total</th>
                    <th>Parcial</th>
                    <th>Não registrou</th>
                    <th>Ausência</th>
                    <th>Feriado</th>
                    <th>Atrasos</th>
                    <th>Apurado / previsto</th>
                    <th>Saldo</th>
                    <th className="text-right">Pendências</th>
                  </tr>
                </thead>
                <tbody>
                  {mesFiltrado.map((item) => {
                    const aberto = expandido === item.employeeId;
                    return (
                      <>
                        <tr key={item.employeeId}>
                          <td>
                            <div className="flex items-center gap-3">
                              <Avatar nome={item.nome} />
                              <div>
                                <p className="text-[13px] font-bold text-slate-800">{item.nome}</p>
                                <p className="text-[11px] text-slate-500">
                                  {item.modeloNome ?? "horário individual"} ·{" "}
                                  {item.diasPrevistos} dia(s) previsto(s)
                                </p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <Badge tone="success">{item.completos}</Badge>
                          </td>
                          <td>
                            {item.parciais > 0 ? (
                              <Badge tone="warning">{item.parciais}</Badge>
                            ) : (
                              <span className="text-[12px] text-slate-400">0</span>
                            )}
                          </td>
                          <td>
                            {item.semRegistro > 0 ? (
                              <Badge tone="danger">{item.semRegistro}</Badge>
                            ) : (
                              <span className="text-[12px] text-slate-400">0</span>
                            )}
                          </td>
                          <td className="text-[12px] text-slate-600">
                            {item.ausencias}
                            {item.aguardando > 0 ? (
                              <span className="block text-[10px] text-slate-400">
                                {item.aguardando} aguardando
                              </span>
                            ) : null}
                          </td>
                          <td className="text-[12px] text-slate-600">
                            {item.feriados}
                            {item.extras > 0 ? (
                              <span className="block text-[10px] text-brand-600">
                                {item.extras} extra
                              </span>
                            ) : null}
                          </td>
                          <td className="text-[12px] font-semibold text-slate-700">{item.atrasos}</td>
                          <td className="text-[12px]">
                            <p className="font-semibold text-slate-700">
                              {formatDuration(item.totalMinutos)}
                            </p>
                            <p className="text-slate-400">
                              previsto {formatDuration(item.esperadoMinutos)}
                            </p>
                          </td>
                          <td>
                            <Badge tone={item.saldoMinutos >= 0 ? "success" : "danger"}>
                              {formatSigned(item.saldoMinutos)}
                            </Badge>
                          </td>
                          <td>
                            <div className="flex justify-end">
                              {item.diasComProblema.length > 0 ? (
                                <Button
                                  size="sm"
                                  variant={aberto ? "subtle" : "outline"}
                                  onClick={() => setExpandido(aberto ? null : item.employeeId)}
                                >
                                  {aberto ? "Ocultar" : `${item.diasComProblema.length} dia(s)`}
                                </Button>
                              ) : (
                                <Badge tone="success">
                                  <CheckIcon className="h-3 w-3" /> Em ordem
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                        {aberto ? (
                          <tr key={`${item.employeeId}-detalhe`}>
                            <td colSpan={10} className="bg-slate-50/70">
                              <div className="flex flex-wrap items-center gap-1.5 py-1">
                                {item.diasComProblema.map((dia) => (
                                  <span
                                    key={dia.data}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                                      dia.status === "SEM_REGISTRO"
                                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                                        : "bg-amber-50 text-amber-800 ring-amber-200"
                                    }`}
                                  >
                                    {formatDateBR(dia.data)} · {dia.label}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setJustificar({
                                          employeeId: item.employeeId,
                                          nome: item.nome,
                                          cargo: item.cargo,
                                          matricula: item.matricula,
                                          data: dia.data,
                                          tipoSugerido:
                                            dia.status === "SEM_REGISTRO" ? "DIA_INTEIRO" : "PARCIAL",
                                        })
                                      }
                                      className="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-700 transition hover:bg-white"
                                      title="Justificar falta neste dia"
                                    >
                                      justificar
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </>
      )}

      <JustificarFaltaModal
        open={Boolean(justificar)}
        onClose={() => setJustificar(null)}
        alvo={justificar}
        onSaved={() => void carregar()}
        servidores={
          justificar && justificar.employeeId === 0
            ? (dados?.dia ?? []).map((item) => ({
                employeeId: item.employeeId,
                nome: item.nome,
                cargo: item.cargo,
                matricula: item.matricula,
              }))
            : undefined
        }
      />

      <Card className="p-5">
        <p className="text-sm font-bold text-slate-800">Como ler a conferência</p>
        <ul className="mt-3 grid gap-2 text-[13px] leading-relaxed text-slate-600 sm:grid-cols-2">
          <li>
            <strong>Registro total</strong> — todas as batidas previstas para o horário do dia foram
            registradas.
          </li>
          <li>
            <strong>Registro parcial</strong> — houve batida, mas falta alguma (entrada, almoço,
            retorno ou saída).
          </li>
          <li>
            <strong>Não registrou</strong> — dia de expediente encerrado sem nenhuma batida (falta
            injustificada até justificativa da gestão).
          </li>
          <li>
            <strong>Aguardando registro</strong> — dia em curso; o servidor ainda pode bater o ponto.
          </li>
          <li>
            <strong>Ausência justificada</strong> — férias, licença saúde, licença-prêmio, orientação
            técnica, atestado e demais afastamentos cadastrados.
          </li>
          <li>
            <strong>Feriado / ponto facultativo</strong> — data do calendário escolar com ponto
            bloqueado.
          </li>
        </ul>
      </Card>
    </div>
  );
}
