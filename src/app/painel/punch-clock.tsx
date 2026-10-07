"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  FingerprintIcon,
  SproutIcon,
  SunIcon,
} from "@/components/icons";
import { Modal } from "@/components/modal";
import { RetificacaoModal } from "@/components/retificacao-modal";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, StatCard } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import {
  AUSENCIA_TONE,
  absenceLabel,
  absencePeriodLabel,
  holidayTone,
  type Ausencia,
} from "@/lib/ausencias";
import {
  ENTRY_LABELS,
  ENTRY_SHORT,
  WEEKDAYS,
  computeWorkedMinutes,
  dayOfWeek,
  formatDateBR,
  formatDateLong,
  formatDuration,
  formatSigned,
  weekdayLabel,
  type EntryType,
} from "@/lib/time";

export type RegistroDia = { id: number; tipo: EntryType; hora: string };

export type WeekRow = {
  diaSemana: number;
  trabalha: boolean;
  label: string;
  minutos: number;
  toleranciaMin: number;
};

export type BlockInfoProps = {
  tipo: string;
  titulo: string;
  descricao: string;
};

export type FeriadoResumo = {
  data: string;
  nome: string;
  tipo: string;
  bloqueiaPonto: boolean;
};

export type PunchClockProps = {
  bloqueio: BlockInfoProps | null;
  feriado: { nome: string; tipo: string; bloqueiaPonto: boolean } | null;
  feriadosProximos: FeriadoResumo[];
  minhasAusencias: Ausencia[];
  nome: string;
  cargo: string | null;
  matricula: string | null;
  hoje: string;
  modeloNome: string | null;
  horarioHoje: {
    diaSemana: number;
    trabalha: boolean;
    entrada: string | null;
    saidaAlmoco: string | null;
    retornoAlmoco: string | null;
    saidaExpediente: string | null;
    toleranciaMin: number;
  } | null;
  horarioLabel: string;
  trabalhaHoje: boolean;
  previstoHoje: number;
  esperadas: EntryType[];
  janela: { abre: string; fecha: string; bloquear: boolean } | null;
  semana: WeekRow[];
  cargaSemanalMin: number;
  registrosIniciais: RegistroDia[];
  resumo: {
    diasTrabalhados: number;
    diasFalta: number;
    atrasos: number;
    totalMinutos: number;
    esperadoMinutos: number;
    saldoMinutos: number;
  };
  saldoAcumulado: number;
};

const GREETING = (hour: number) =>
  hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

export function PunchClock({
  bloqueio,
  feriado,
  feriadosProximos,
  minhasAusencias,
  nome,
  cargo,
  matricula,
  hoje,
  modeloNome,
  horarioHoje,
  horarioLabel,
  trabalhaHoje,
  previstoHoje,
  esperadas,
  janela,
  semana,
  cargaSemanalMin,
  registrosIniciais,
  resumo,
  saldoAcumulado,
}: PunchClockProps) {
  const router = useRouter();
  const toast = useToast();
  const [clock, setClock] = useState<string>("");
  const [secondsOffset, setSecondsOffset] = useState(0);
  const [registros, setRegistros] = useState<RegistroDia[]>(registrosIniciais);
  const [loadingTipo, setLoadingTipo] = useState<EntryType | null>(null);
  const [comprovante, setComprovante] = useState<{ tipo: EntryType; hora: string } | null>(null);
  const [retificacaoOpen, setRetificacaoOpen] = useState(false);

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const tick = () => setClock(formatter.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const hour = Number(clock.slice(0, 2));
    if (!Number.isNaN(hour)) setSecondsOffset(hour);
  }, [clock]);

  // Revalida a janela liberada a cada minuto (dia/horário cadastrado podem virar).
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 60000);
    return () => window.clearInterval(id);
  }, [router]);

  const mapa = useMemo(() => {
    const map: Partial<Record<EntryType, string>> = {};
    registros.forEach((registro) => {
      map[registro.tipo] = registro.hora;
    });
    return map;
  }, [registros]);

  const registrados = registros.map((registro) => registro.tipo);
  const proxima = esperadas.find((tipo) => !registrados.includes(tipo)) ?? null;
  const trabalhado = computeWorkedMinutes({
    ENTRADA: mapa.ENTRADA ?? null,
    SAIDA_ALMOCO: mapa.SAIDA_ALMOCO ?? null,
    RETORNO_ALMOCO: mapa.RETORNO_ALMOCO ?? null,
    SAIDA_EXPEDIENTE: mapa.SAIDA_EXPEDIENTE ?? null,
  });
  const previsto = previstoHoje;
  const progresso = previsto > 0 ? Math.min(100, Math.round((trabalhado / previsto) * 100)) : 0;
  const emIntervalo = Boolean(mapa.SAIDA_ALMOCO && !mapa.RETORNO_ALMOCO);
  const encerrado = Boolean(mapa.SAIDA_EXPEDIENTE);

  const status = bloqueio
    ? bloqueio.tipo === "AUSENCIA"
      ? { label: `Ausência: ${bloqueio.titulo}`, tone: "warning" as const }
      : { label: bloqueio.titulo, tone: "danger" as const }
    : !trabalhaHoje
    ? registros.length > 0
      ? { label: "Trabalho fora do horário", tone: "info" as const }
      : { label: "Sem expediente hoje", tone: "neutral" as const }
    : encerrado
    ? { label: "Expediente encerrado", tone: "neutral" as const }
    : emIntervalo
      ? { label: "Em intervalo de almoço", tone: "warning" as const }
      : mapa.ENTRADA
        ? { label: "Em expediente", tone: "success" as const }
        : { label: "Aguardando entrada", tone: "info" as const };

  const registrar = async (tipo: EntryType) => {
    setLoadingTipo(tipo);
    try {
      const data = await apiFetch<{
        registro: { id: number; tipo: EntryType; hora: string; data: string };
        registrosDoDia: RegistroDia[];
        mensagem: string;
      }>("/api/registros/ponto", {
        method: "POST",
        body: JSON.stringify({ tipo }),
      });
      setRegistros(data.registrosDoDia);
      setComprovante({ tipo: data.registro.tipo, hora: data.registro.hora });
      toast.success("Ponto registrado", data.mensagem);
      router.refresh();
    } catch (error) {
      toast.error("Registro não realizado", (error as Error).message);
    } finally {
      setLoadingTipo(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="relative animate-fade-up overflow-hidden rounded-3xl bg-gradient-to-br from-brand-950 via-brand-800 to-brand-700 p-6 text-white shadow-[var(--shadow-float)] sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent-400/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-accent-300">
                {GREETING(secondsOffset)}, {nome.split(" ")[0]}
              </p>
              <p className="mt-1 font-mono text-5xl font-black tabular-nums tracking-tight sm:text-6xl">
                {clock || "--:--:--"}
              </p>
              <p className="mt-1.5 text-sm text-brand-100/85">{formatDateLong(hoje)}</p>
              <p className="mt-1 text-[12px] text-brand-200/70">
                {cargo ?? "Servidor"}
                {matricula ? ` · Matrícula ${matricula}` : ""}
              </p>
            </div>
            <Badge tone={status.tone} className="bg-white/90">
              {status.label}
            </Badge>
          </div>

          <div className="relative mt-7 grid gap-3 sm:grid-cols-4">
            {esperadas.map((tipo) => {
              const hora = mapa[tipo];
              const isNext = proxima === tipo;
              return (
                <div
                  key={tipo}
                  className={`rounded-2xl px-3.5 py-3 ring-1 ring-inset transition ${
                    hora
                      ? "bg-white/12 ring-white/20"
                      : isNext
                        ? "bg-accent-500/25 ring-accent-300/60"
                        : "bg-white/5 ring-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-100/80">
                      {ENTRY_SHORT[tipo]}
                    </p>
                    {hora ? (
                      <CheckIcon className="h-3.5 w-3.5 text-accent-300" />
                    ) : isNext ? (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-accent-300" />
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold tabular-nums">
                    {hora ? hora.slice(0, 5) : "--:--"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="relative mt-6">
            <div className="flex items-center justify-between text-[11px] font-semibold text-brand-100/80">
              <span>
                {trabalhaHoje
                  ? `Previsto hoje ${formatDuration(previsto)} · tolerância ${horarioHoje?.toleranciaMin ?? 10} min`
                  : "Sem expediente previsto para hoje"}
              </span>
              <span>{formatDuration(trabalhado)} apuradas</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-300 to-accent-500 transition-all duration-700"
                style={{ width: `${Math.max(progresso, 2)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="card animate-fade-up p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">
                Bater ponto
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                {trabalhaHoje
                  ? `Horário de hoje: ${horarioLabel}`
                  : "Hoje não há expediente previsto no seu horário"}
                {modeloNome ? ` · modelo ${modeloNome}` : ""}
              </p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
              <FingerprintIcon className="h-5 w-5" />
            </span>
          </div>

          {bloqueio ? (
            <div
              className={`mt-5 rounded-2xl px-4 py-4 ring-1 ring-inset ${
                bloqueio.tipo === "AUSENCIA"
                  ? "bg-amber-50 text-amber-800 ring-amber-200"
                  : "bg-rose-50 text-rose-800 ring-rose-200"
              }`}
            >
              <p className="flex items-center gap-2 text-[13px] font-bold">
                <AlertIcon className="h-4 w-4" /> Registro de ponto bloqueado
              </p>
              <p className="mt-1.5 text-[13px] font-semibold">{bloqueio.titulo}</p>
              <p className="mt-1 text-[12px] leading-relaxed">{bloqueio.descricao}</p>
            </div>
          ) : proxima ? (
            <Button
              size="lg"
              variant="accent"
              loading={loadingTipo === proxima}
              onClick={() => registrar(proxima)}
              className="mt-5 w-full"
            >
              <FingerprintIcon className="h-5 w-5" />
              Registrar {ENTRY_LABELS[proxima]}
            </Button>
          ) : (
            <div className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3.5 text-center text-[13px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Todas as marcações previstas para hoje já foram registradas.
            </div>
          )}

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {esperadas.map((tipo) => {
              const hora = mapa[tipo];
              const bloqueado = Boolean(hora) || proxima !== tipo || Boolean(bloqueio);
              return (
                <button
                  key={tipo}
                  type="button"
                  disabled={bloqueado || loadingTipo !== null}
                  onClick={() => registrar(tipo)}
                  className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-left text-[13px] font-semibold transition ${
                    bloqueado
                      ? "border-slate-200 bg-slate-50 text-slate-400"
                      : "border-slate-200 bg-white text-slate-700 hover:border-accent-400 hover:text-accent-700"
                  }`}
                >
                  <span>{ENTRY_LABELS[tipo]}</span>
                  <span className="font-mono text-xs tabular-nums">
                    {hora ? hora.slice(0, 5) : "pendente"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[12px] text-slate-600 ring-1 ring-inset ring-slate-200">
            <p className="font-bold uppercase tracking-wider text-slate-500">
              Janela de registro liberada
            </p>
            {janela ? (
              <>
                <p className="mt-1 font-mono text-[13px] font-bold text-slate-800">
                  {janela.abre} às {janela.fecha}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {janela.bloquear
                    ? "Fora desse período o sistema não aceita o registro de ponto."
                    : "Bloqueio de horário desativado pela direção."}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">
                Sem janela hoje — não há expediente cadastrado no seu horário.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button variant="outline" size="sm" onClick={() => setRetificacaoOpen(true)}>
              <AlertIcon className="h-4 w-4" /> Solicitar retificação
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.push("/painel/registros")}>
              Ver espelho do mês
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Horas no mês"
          value={formatDuration(resumo.totalMinutos)}
          hint={`Previsto: ${formatDuration(resumo.esperadoMinutos)}`}
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Saldo acumulado"
          value={formatSigned(saldoAcumulado)}
          hint="Somatório dos últimos 3 meses"
          tone={saldoAcumulado >= 0 ? "success" : "danger"}
          icon={<SproutIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Dias com registro"
          value={resumo.diasTrabalhados}
          hint={`${resumo.diasFalta} dia(s) sem marcação no mês`}
          tone="info"
          icon={<CheckIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Atrasos no mês"
          value={resumo.atrasos}
          hint="Considera a tolerância da jornada"
          tone={resumo.atrasos > 0 ? "warning" : "success"}
          icon={<SunIcon className="h-[18px] w-[18px]" />}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <div className="card-header">
            <div>
              <p className="text-sm font-bold text-slate-800">Meu horário de trabalho</p>
              <p className="text-xs text-slate-500">
                Horário individual definido pela direção · carga semanal de{" "}
                {formatDuration(cargaSemanalMin)}
              </p>
            </div>
            <Badge tone="brand">
              {semana.filter((dia) => dia.trabalha).length} dias por semana
            </Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {semana.map((dia) => (
              <li
                key={dia.diaSemana}
                className={`flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 ${
                  dia.diaSemana === dayOfWeek(hoje) ? "bg-brand-50/60" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-9 w-11 place-items-center rounded-lg text-[11px] font-bold ring-1 ring-inset ${
                      dia.trabalha
                        ? "bg-brand-600 text-white ring-brand-600"
                        : "bg-slate-50 text-slate-400 ring-slate-200"
                    }`}
                  >
                    {WEEKDAYS.find((item) => item.iso === dia.diaSemana)?.short}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">
                      {WEEKDAYS.find((item) => item.iso === dia.diaSemana)?.long}
                      {dia.diaSemana === dayOfWeek(hoje) ? " · hoje" : ""}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {dia.trabalha
                        ? `${dia.label} · ${formatDuration(dia.minutos)}`
                        : "Sem expediente"}
                    </p>
                  </div>
                </div>
                {dia.trabalha ? (
                  <span className="text-[11px] font-semibold text-slate-400">
                    tolerância {dia.toleranciaMin} min
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-sm font-bold text-slate-800">Como funciona o meu registro</p>
            <ul className="mt-3 space-y-3 text-[13px] leading-relaxed text-slate-600">
              <li className="flex gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                {esperadas.length === 4
                  ? "Seu horário de hoje tem intervalo de almoço: são 4 batidas (entrada, saída para o almoço, retorno e saída)."
                  : "Seu horário de hoje não tem intervalo: são registradas a entrada e a saída do expediente."}
              </li>
              <li className="flex gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                Feriados, pontos facultativos e ausências registradas pela direção bloqueiam o
                registro automaticamente.
              </li>
              <li className="flex gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                Horário registrado indevidamente? Solicite a retificação — a gestão analisa e, se
                aprovada, o espelho é corrigido automaticamente.
              </li>
              <li className="flex gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                O registro é liberado somente nos dias e horários cadastrados pela direção — dias
                sem expediente (fins de semana e feriados) não permitem batida de ponto.
              </li>
              {feriado && !feriado.bloqueiaPonto ? (
                <li className="flex gap-2.5 rounded-xl bg-brand-50 px-3.5 py-2.5 text-brand-800 ring-1 ring-inset ring-brand-100">
                  <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  Hoje é {feriado.nome} — data cadastrada no calendário escolar sem bloqueio de
                  ponto. As horas registradas serão apuradas normalmente.
                </li>
              ) : null}
            </ul>
          </Card>

          <Card>
            <div className="card-header">
              <div>
                <p className="text-sm font-bold text-slate-800">Calendário e minhas ausências</p>
                <p className="text-xs text-slate-500">
                  Datas bloqueadas pela direção e afastamentos registrados no seu nome
                </p>
              </div>
              <Badge tone="brand">{feriadosProximos.length} datas</Badge>
            </div>
            <div className="grid gap-0 divide-y divide-slate-100">
              {minhasAusencias.length > 0 ? (
                <div className="px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Minhas ausências
                  </p>
                  <ul className="mt-2.5 space-y-2">
                    {minhasAusencias.map((ausencia) => (
                      <li
                        key={ausencia.id ?? `${ausencia.tipo}-${ausencia.dataInicio}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-200"
                      >
                        <div>
                          <p className="text-[13px] font-semibold text-slate-800">
                            {absenceLabel(ausencia.tipo)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatDateBR(ausencia.dataInicio)}
                            {ausencia.dataFim !== ausencia.dataInicio
                              ? ` → ${formatDateBR(ausencia.dataFim)}`
                              : ""}{" "}
                            · {absencePeriodLabel(ausencia)}
                          </p>
                          {ausencia.motivo ? (
                            <p className="text-[11px] text-slate-400">{ausencia.motivo}</p>
                          ) : null}
                        </div>
                        <Badge tone={AUSENCIA_TONE[ausencia.tipo] ?? "neutral"}>
                          {absencePeriodLabel(ausencia).startsWith("Parcial") ? "Parcial" : "Total"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Próximos feriados e pontos facultativos
                </p>
                {feriadosProximos.length === 0 ? (
                  <p className="mt-2 text-[13px] text-slate-500">
                    Nenhuma data cadastrada para os próximos meses.
                  </p>
                ) : (
                  <ul className="mt-2.5 space-y-2">
                    {feriadosProximos.slice(0, 6).map((item) => (
                      <li
                        key={item.data}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 ring-1 ring-inset ring-slate-200"
                      >
                        <div>
                          <p className="text-[13px] font-semibold text-slate-800">{item.nome}</p>
                          <p className="text-[11px] text-slate-500">
                            {formatDateBR(item.data)} · {weekdayLabel(dayOfWeek(item.data), true)}
                          </p>
                        </div>
                        <Badge tone={holidayTone(item.tipo)}>
                          {item.bloqueiaPonto ? "Ponto bloqueado" : "Sem bloqueio"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <Modal
        open={Boolean(comprovante)}
        onClose={() => setComprovante(null)}
        title="Comprovante de marcação"
        description="Registro gravado com data, hora e origem da batida."
        size="sm"
        footer={
          <Button variant="accent" onClick={() => setComprovante(null)}>
            Concluir
          </Button>
        }
      >
        {comprovante ? (
          <div className="space-y-4 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200">
              <CheckIcon className="h-7 w-7" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-500">
                {ENTRY_LABELS[comprovante.tipo]}
              </p>
              <p className="font-mono text-4xl font-black tabular-nums text-slate-900">
                {comprovante.hora.slice(0, 5)}
              </p>
              <p className="mt-1 text-[13px] text-slate-500">{formatDateLong(hoje)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3.5 py-3 text-left text-[12px] text-slate-500 ring-1 ring-inset ring-slate-200">
              <p>Origem: aplicativo do servidor (web)</p>
              <p>Horário oficial: America/Sao_Paulo</p>
              <p>
                Total apurado no dia:{" "}
                <strong className="text-slate-700">
                  {formatDuration(
                    computeWorkedMinutes({
                      ENTRADA: mapa.ENTRADA ?? null,
                      SAIDA_ALMOCO: mapa.SAIDA_ALMOCO ?? null,
                      RETORNO_ALMOCO: mapa.RETORNO_ALMOCO ?? null,
                      SAIDA_EXPEDIENTE: mapa.SAIDA_EXPEDIENTE ?? null,
                    }),
                  )}
                </strong>
              </p>
            </div>
          </div>
        ) : null}
      </Modal>

      <RetificacaoModal
        open={retificacaoOpen}
        onClose={() => setRetificacaoOpen(false)}
        alvo={{ data: hoje, horaAtual: null }}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
