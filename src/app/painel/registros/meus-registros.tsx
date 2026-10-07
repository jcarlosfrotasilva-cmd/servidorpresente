"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertIcon, CalendarIcon, ClockIcon, DownloadIcon } from "@/components/icons";
import { RetificacaoModal, type RetificacaoAlvo } from "@/components/retificacao-modal";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, SectionTitle, StatCard } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { AUSENCIA_SHORT, AUSENCIA_TONE, holidayLabel, holidayTone } from "@/lib/ausencias";
import {
  ENTRY_LABELS,
  ENTRY_ORDER,
  formatDateBR,
  formatDuration,
  formatSigned,
  monthLabel,
  weekdayLabel,
  type EntryType,
} from "@/lib/time";

type Registro = {
  id: number;
  data: string;
  tipo: EntryType;
  hora: string;
  origin: "SERVIDOR" | "GESTOR" | "RETIFICACAO";
  observacao: string | null;
};

type DiaRelatorio = {
  data: string;
  weekday: number;
  entries: { tipo: EntryType; hora: string; id: number }[];
  esperadas: EntryType[];
  feriado: { nome: string; tipo: string; bloqueiaPonto: boolean } | null;
  ausencias: {
    tipo: string;
    label: string;
    periodo: string;
    diaInteiro: boolean;
    horaInicio: string | null;
    horaFim: string | null;
  }[];
  ausenciaDiaInteiro: boolean;
  diaNaoUtil: boolean;
  horario: {
    entrada: string | null;
    saidaAlmoco: string | null;
    retornoAlmoco: string | null;
    saidaExpediente: string | null;
    toleranciaMin: number;
  } | null;
  workedMinutes: number;
  expectedMinutes: number;
  saldo: number;
  atraso: boolean;
  incompleto: boolean;
  falta: boolean;
  folga: boolean;
};

type Relatorio = {
  mes: string;
  rows: {
    diasTrabalhados: number;
    diasFalta: number;
    diasIncompletos: number;
    diasExtra: number;
    atrasos: number;
    totalMinutos: number;
    esperadoMinutos: number;
    saldoMinutos: number;
    modeloNome: string | null;
    diasSemana: number[];
    cargaSemanalMin: number;
    dias: DiaRelatorio[];
  }[];
};

const ORIGEM_TONE = {
  SERVIDOR: "brand",
  GESTOR: "warning",
  RETIFICACAO: "info",
} as const;

const ORIGEM_LABEL = {
  SERVIDOR: "Aplicativo",
  GESTOR: "Gestão",
  RETIFICACAO: "Retificado",
} as const;

export function MeusRegistros({
  mesInicial,
  nome,
  matricula,
}: {
  mesInicial: string;
  nome: string;
  matricula: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [mes, setMes] = useState(mesInicial);
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [alvo, setAlvo] = useState<RetificacaoAlvo | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await apiFetch<Relatorio>(`/api/relatorios?mes=${mes}`);
      setRelatorio(data);
    } catch (error) {
      toast.error("Falha ao carregar registros", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const linha = relatorio?.rows[0];
  const dias = useMemo(
    () => (linha?.dias ?? []).slice().sort((a, b) => (a.data < b.data ? 1 : -1)),
    [linha],
  );

  const semanaResumo = useMemo(() => {
    const nomes = [1, 2, 3, 4, 5, 6, 7].map((iso) => weekdayLabel(iso));
    return (linha?.diasSemana ?? []).map((iso) => nomes[iso - 1]).join(" · ") || "sem expediente";
  }, [linha]);

  const exportar = async () => {
    try {
      const registros = await apiFetch<{ registros: Registro[] }>(
        `/api/registros?escopo=meus&mes=${mes}`,
      );
      const header = ["Data", "Tipo", "Horario", "Origem", "Observacao"];
      const linhas = registros.registros
        .slice()
        .sort((a, b) => (a.data + a.hora < b.data + b.hora ? -1 : 1))
        .map((registro) =>
          [
            formatDateBR(registro.data),
            ENTRY_LABELS[registro.tipo],
            registro.hora.slice(0, 5),
            ORIGEM_LABEL[registro.origin],
            (registro.observacao ?? "").replace(/;/g, ","),
          ].join(";"),
        );
      const csv = `\uFEFF${[header.join(";"), ...linhas].join("\n")}`;
      // Download local do espelho do servidor.
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `meu-espelho-${mes}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Espelho exportado", "O arquivo CSV foi baixado.");
    } catch (error) {
      toast.error("Não foi possível exportar", (error as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Meu espelho de ponto"
        description={`${nome}${matricula ? ` · Matrícula ${matricula}` : ""} · ${
          linha?.modeloNome ? `modelo ${linha.modeloNome}` : "horário individual"
        }${linha ? ` · ${linha.diasSemana.length} dia(s) por semana` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="month"
              value={mes}
              onChange={(event) => setMes(event.target.value || mesInicial)}
              className="input h-11 w-[168px]"
            />
            <Button variant="outline" onClick={exportar}>
              <DownloadIcon className="h-4 w-4" /> CSV
            </Button>
            <Button
              variant="accent"
              onClick={() => setAlvo({ data: dias[0]?.data ?? mesInicial + "-01" })}
            >
              <AlertIcon className="h-4 w-4" /> Solicitar retificação
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Horas em ${monthLabel(mes)}`}
          value={formatDuration(linha?.totalMinutos ?? 0)}
          hint={`Previsto ${formatDuration(linha?.esperadoMinutos ?? 0)}`}
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Saldo do mês"
          value={formatSigned(linha?.saldoMinutos ?? 0)}
          hint={(linha?.saldoMinutos ?? 0) >= 0 ? "Crédito de horas" : "Débito de horas"}
          tone={(linha?.saldoMinutos ?? 0) >= 0 ? "success" : "danger"}
          icon={<CalendarIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Dias trabalhados"
          value={linha?.diasTrabalhados ?? 0}
          hint={`${linha?.diasFalta ?? 0} dia(s) sem marcação`}
          tone="info"
          icon={<CalendarIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Atrasos / incompletos"
          value={`${linha?.atrasos ?? 0} / ${linha?.diasIncompletos ?? 0}`}
          hint={`${linha?.diasExtra ?? 0} dia(s) fora do horário previsto`}
          tone={(linha?.atrasos ?? 0) > 0 ? "warning" : "success"}
          icon={<AlertIcon className="h-[18px] w-[18px]" />}
        />
      </div>

      <Card>
        <div className="card-header">
          <div>
            <p className="text-sm font-bold text-slate-800">Marcações dia a dia</p>
            <p className="text-xs text-slate-500">
              O quadro abaixo segue o seu horário individual, dia por dia. Toque em uma batida para
              solicitar retificação.
            </p>
          </div>
          <Badge tone="brand">
            {semanaResumo} · {formatDuration(linha?.cargaSemanalMin ?? 0)}/semana
          </Badge>
        </div>

        {carregando ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : dias.length === 0 ? (
          <EmptyState
            title="Nenhuma jornada prevista neste mês"
            description="Neste mês não há expediente previsto no seu horário. Confirme com a direção se o seu quadro de horários está correto."
            icon={<CalendarIcon className="h-6 w-6" />}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {dias.map((dia) => {
              const aberto = expandido === dia.data;
              return (
                <div key={dia.data} className="px-4 py-3.5 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setExpandido(aberto ? null : dia.data)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold ring-1 ring-inset ${
                          dia.falta
                            ? "bg-rose-50 text-rose-600 ring-rose-200"
                            : dia.incompleto
                              ? "bg-amber-50 text-amber-700 ring-amber-200"
                              : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        }`}
                      >
                        {weekdayLabel(dia.weekday)}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{formatDateBR(dia.data)}</p>
                        <p className="text-[11px] text-slate-500">
                          {dia.feriado
                            ? `${dia.feriado.nome} · calendário escolar`
                            : dia.ausenciaDiaInteiro
                              ? `Ausência registrada · ${formatDuration(dia.workedMinutes)} apuradas`
                              : dia.folga
                            ? `Fora do horário previsto · ${formatDuration(dia.workedMinutes)} apuradas`
                            : dia.falta
                              ? `Sem marcações · previsto ${formatDuration(dia.expectedMinutes)}`
                              : `${dia.entries.length} de ${dia.esperadas.length} batidas · ${formatDuration(
                                  dia.workedMinutes,
                                )} de ${formatDuration(dia.expectedMinutes)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {dia.feriado?.bloqueiaPonto ? (
                        <Badge tone={holidayTone(dia.feriado.tipo)}>
                          {holidayLabel(dia.feriado.tipo)}
                        </Badge>
                      ) : null}
                      {dia.ausencias.map((ausencia) => (
                        <Badge
                          key={`${ausencia.tipo}-${ausencia.horaInicio ?? "dia"}`}
                          tone={AUSENCIA_TONE[ausencia.tipo] ?? "neutral"}
                        >
                          {AUSENCIA_SHORT[ausencia.tipo] ?? ausencia.label}
                          {ausencia.diaInteiro ? "" : ` ${ausencia.horaInicio}-${ausencia.horaFim}`}
                        </Badge>
                      ))}
                      {dia.folga && !dia.feriado ? (
                        <Badge tone="info">Fora do horário</Badge>
                      ) : null}
                      {dia.atraso ? <Badge tone="warning">Atraso</Badge> : null}
                      {dia.falta ? <Badge tone="danger">Falta</Badge> : null}
                      {dia.incompleto ? <Badge tone="warning">Incompleto</Badge> : null}
                      <Badge tone={dia.saldo >= 0 ? "success" : "danger"}>
                        {formatSigned(dia.saldo)}
                      </Badge>
                    </div>
                  </button>

                  {aberto ? (
                    <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                      {(dia.esperadas.length === 0 && dia.ausenciaDiaInteiro
                        ? ENTRY_ORDER.slice(0, 2)
                        : dia.esperadas.length === 0
                          ? ENTRY_ORDER
                          : dia.esperadas
                      ).map((tipo) => {
                        const registro = dia.entries.find((entry) => entry.tipo === tipo);
                        return (
                          <button
                            key={tipo}
                            type="button"
                            onClick={() =>
                              setAlvo({
                                data: dia.data,
                                tipo,
                                horaAtual: registro?.hora ?? null,
                              })
                            }
                            className={`rounded-xl border px-3.5 py-3 text-left transition ${
                              registro
                                ? "border-slate-200 bg-white hover:border-brand-400"
                                : "border-dashed border-amber-300 bg-amber-50/60 hover:border-amber-400"
                            }`}
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              {ENTRY_LABELS[tipo]}
                            </p>
                            <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-800">
                              {registro ? registro.hora.slice(0, 5) : "--:--"}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {registro ? "Clique para retificar" : "Clique para solicitar inclusão"}
                            </p>
                          </button>
                        );
                      })}
                      {dia.horario ? (
                        <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-500 ring-1 ring-inset ring-slate-200 sm:col-span-2 xl:col-span-4">
                          Horário previsto para {weekdayLabel(dia.weekday, true)}:{" "}
                          <strong className="font-mono text-slate-700">
                            {dia.horario.entrada ?? "--:--"}
                            {dia.horario.saidaAlmoco && dia.horario.retornoAlmoco
                              ? `–${dia.horario.saidaAlmoco} / ${dia.horario.retornoAlmoco}–${
                                  dia.horario.saidaExpediente ?? "--:--"
                                }`
                              : `–${dia.horario.saidaExpediente ?? "--:--"}`}
                          </strong>{" "}
                          · tolerância de {dia.horario.toleranciaMin} min
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <RetificacaoModal
        open={Boolean(alvo)}
        onClose={() => setAlvo(null)}
        alvo={alvo}
        onSaved={() => {
          void carregar();
          router.refresh();
        }}
      />
    </div>
  );
}


