"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertIcon,
  CalendarIcon,
  ChartIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
} from "@/components/icons";
import { Modal } from "@/components/modal";
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
import { AUSENCIA_SHORT, AUSENCIA_TONE, holidayTone, holidayLabel } from "@/lib/ausencias";
import {
  ENTRY_LABELS,
  formatDateBR,
  formatDuration,
  formatSigned,
  monthLabel,
  weekdayLabel,
  type EntryType,
} from "@/lib/time";

type Dia = {
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

type LinhaRelatorio = {
  employeeId: number;
  nome: string;
  cargo: string;
  matricula: string;
  modeloNome: string | null;
  diasSemana: number[];
  cargaSemanalMin: number;
  diasTrabalhados: number;
  diasFalta: number;
  diasIncompletos: number;
  diasExtra: number;
  diasFeriado: number;
  diasAusencia: number;
  atrasos: number;
  totalMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
  dias: Dia[];
};

type Relatorio = {
  mes: string;
  rows: LinhaRelatorio[];
  totais: {
    servidores: number;
    totalMinutos: number;
    esperadoMinutos: number;
    saldoMinutos: number;
    diasFalta: number;
    atrasos: number;
    diasExtra: number;
    diasFeriado: number;
    diasAusencia: number;
  };
};

export function RelatoriosGestor({ mesInicial }: { mesInicial: string }) {
  const toast = useToast();
  const [mes, setMes] = useState(mesInicial);
  const [employeeId, setEmployeeId] = useState("todos");
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState<LinhaRelatorio | null>(null);
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await apiFetch<Relatorio>(
        `/api/relatorios?mes=${mes}&employeeId=${employeeId}`,
      );
      setRelatorio(data);
    } catch (error) {
      toast.error("Falha ao gerar relatório", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes, employeeId, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ordenado = useMemo(
    () => (relatorio?.rows ?? []).slice().sort((a, b) => b.totalMinutos - a.totalMinutos),
    [relatorio],
  );

  const exportar = async () => {
    setExportando(true);
    try {
      await downloadFile(`/api/relatorios?mes=${mes}&formato=csv`, `relatorio-ponto-${mes}.csv`);
      toast.success("Relatório exportado", "Planilha CSV gerada para uso na secretaria.");
    } catch (error) {
      toast.error("Não foi possível exportar", (error as Error).message);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Relatórios mensais de frequência"
        description="Consolidação por servidor considerando o horário individual de cada dia da semana (horas previstas, saldos, faltas e atrasos)."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              type="month"
              value={mes}
              onChange={(event) => setMes(event.target.value || mesInicial)}
              className="w-[160px]"
            />
            <Select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="w-[230px]"
            >
              <option value="todos">Todos os servidores</option>
              {(relatorio?.rows ?? []).map((row) => (
                <option key={row.employeeId} value={row.employeeId}>
                  {row.nome}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={exportar} loading={exportando}>
              <DownloadIcon className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Horas trabalhadas"
          value={formatDuration(relatorio?.totais.totalMinutos ?? 0)}
          hint={`Previsto ${formatDuration(relatorio?.totais.esperadoMinutos ?? 0)}`}
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Saldo consolidado"
          value={formatSigned(relatorio?.totais.saldoMinutos ?? 0)}
          hint={(relatorio?.totais.saldoMinutos ?? 0) >= 0 ? "Crédito de horas" : "Débito de horas"}
          tone={(relatorio?.totais.saldoMinutos ?? 0) >= 0 ? "success" : "danger"}
          icon={<ChartIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Faltas no mês"
          value={relatorio?.totais.diasFalta ?? 0}
          hint="Dias úteis sem marcação e sem justificativa"
          tone={(relatorio?.totais.diasFalta ?? 0) > 0 ? "warning" : "success"}
          icon={<AlertIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Atrasos / feriados"
          value={`${relatorio?.totais.atrasos ?? 0} / ${relatorio?.totais.diasFeriado ?? 0}`}
          hint={`${relatorio?.totais.diasAusencia ?? 0} ausência(s) justificada(s)`}
          tone={(relatorio?.totais.atrasos ?? 0) > 0 ? "warning" : "success"}
          icon={<CalendarIcon className="h-[18px] w-[18px]" />}
        />
      </div>

      <Card>
        <div className="card-header">
          <div>
            <p className="text-sm font-bold text-slate-800">
              Consolidado de {monthLabel(relatorio?.mes ?? mes)}
            </p>
            <p className="text-xs text-slate-500">
              {relatorio?.totais.servidores ?? 0} servidores · dias úteis conforme a jornada de cada
              vínculo
            </p>
          </div>
          <Badge tone="brand">{ordenado.length} linhas</Badge>
        </div>

        {carregando ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : ordenado.length === 0 ? (
          <EmptyState
            title="Sem dados para o período"
            description="Selecione outro mês ou verifique se há servidores ativos cadastrados."
            icon={<ChartIcon className="h-6 w-6" />}
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>Servidor</th>
                <th>Horário semanal</th>
                <th>Dias</th>
                <th>Faltas</th>
                <th>Incompletos</th>
                <th>Atrasos</th>
                <th>Trabalhado</th>
                <th>Previsto</th>
                <th>Saldo</th>
                <th className="text-right">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {ordenado.map((row) => (
                <tr key={row.employeeId}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar nome={row.nome} />
                      <div>
                        <p className="text-[13px] font-bold text-slate-800">{row.nome}</p>
                        <p className="text-[11px] text-slate-500">
                          {row.cargo} · Mat. {row.matricula}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-[12px] text-slate-600">
                    <p className="font-semibold text-slate-700">
                      {row.diasSemana.length > 0
                        ? `${row.diasSemana.length} dia(s) · ${formatDuration(row.cargaSemanalMin)}`
                        : "Sem expediente"}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {row.modeloNome ? `modelo ${row.modeloNome}` : "horário individual"}
                      {row.diasExtra > 0 ? ` · ${row.diasExtra} dia(s) extra` : ""}
                    </p>
                  </td>
                  <td className="text-[13px] font-semibold text-slate-700">
                    {row.diasTrabalhados}
                  </td>
                  <td>
                    {row.diasFalta > 0 ? (
                      <Badge tone="danger">{row.diasFalta}</Badge>
                    ) : (
                      <span className="text-[13px] text-slate-400">0</span>
                    )}
                  </td>
                  <td>
                    {row.diasIncompletos > 0 ? (
                      <Badge tone="warning">{row.diasIncompletos}</Badge>
                    ) : (
                      <span className="text-[13px] text-slate-400">0</span>
                    )}
                  </td>
                  <td>
                    {row.atrasos > 0 ? (
                      <Badge tone="warning">{row.atrasos}</Badge>
                    ) : (
                      <span className="text-[13px] text-slate-400">0</span>
                    )}
                  </td>
                  <td className="font-semibold text-slate-700">{formatDuration(row.totalMinutos)}</td>
                  <td className="text-[13px] text-slate-600">
                    {formatDuration(row.esperadoMinutos)}
                  </td>
                  <td>
                    <Badge tone={row.saldoMinutos >= 0 ? "success" : "danger"}>
                      {formatSigned(row.saldoMinutos)}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => setDetalhe(row)}>
                        Ver dias
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={Boolean(detalhe)}
        onClose={() => setDetalhe(null)}
        title={detalhe ? `Espelho de ${detalhe.nome}` : ""}
        description={
          detalhe
            ? `${
                detalhe.modeloNome ? `modelo ${detalhe.modeloNome}` : "horário individual"
              } · ${monthLabel(mes)}`
            : ""
        }
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setDetalhe(null)}>
            Fechar
          </Button>
        }
      >
        {detalhe ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Trabalhado", value: formatDuration(detalhe.totalMinutos) },
                { label: "Previsto", value: formatDuration(detalhe.esperadoMinutos) },
                { label: "Saldo", value: formatSigned(detalhe.saldoMinutos) },
                { label: "Faltas / atrasos", value: `${detalhe.diasFalta} / ${detalhe.atrasos}` },
                { label: "Feriados / ausências", value: `${detalhe.diasFeriado} / ${detalhe.diasAusencia}` },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-slate-200"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-slate-200">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Horário previsto</th>
                    <th>Entrada</th>
                    <th>Saída almoço</th>
                    <th>Retorno</th>
                    <th>Saída</th>
                    <th>Apurado</th>
                    <th>Saldo</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.dias
                    .slice()
                    .sort((a, b) => (a.data < b.data ? 1 : -1))
                    .map((dia) => (
                      <tr key={dia.data}>
                        <td className="text-[12px] text-slate-600">
                          {formatDateBR(dia.data)}
                          <span className="ml-1.5 text-slate-400">
                            {weekdayLabel(dia.weekday)}
                          </span>
                        </td>
                        <td className="text-[11px] text-slate-500">
                          {dia.feriado
                            ? dia.feriado.nome
                            : dia.folga
                            ? "Sem expediente"
                            : `${dia.horario?.entrada ?? "--:--"}–${
                                dia.horario?.saidaExpediente ?? "--:--"
                              }${
                                dia.horario?.saidaAlmoco && dia.horario?.retornoAlmoco
                                  ? ` (${dia.horario.saidaAlmoco}–${dia.horario.retornoAlmoco})`
                                  : ""
                              }`}
                        </td>
                        {(["ENTRADA", "SAIDA_ALMOCO", "RETORNO_ALMOCO", "SAIDA_EXPEDIENTE"] as EntryType[]).map(
                          (tipo) => {
                            const entry = dia.entries.find((item) => item.tipo === tipo);
                            const exigida = dia.esperadas.includes(tipo);
                            return (
                              <td
                                key={tipo}
                                className={`font-mono text-[12px] tabular-nums ${
                                  entry
                                    ? "text-slate-700"
                                    : exigida
                                      ? "text-rose-400"
                                      : "text-slate-300"
                                }`}
                                title={ENTRY_LABELS[tipo]}
                              >
                                {entry ? entry.hora : "--:--"}
                              </td>
                            );
                          },
                        )}

                        <td className="text-[12px] font-semibold text-slate-700">
                          {formatDuration(dia.workedMinutes)}
                        </td>
                        <td>
                          <span
                            className={`text-[12px] font-semibold ${
                              dia.saldo >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {formatSigned(dia.saldo)}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
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
                                {ausencia.diaInteiro
                                  ? ""
                                  : ` ${ausencia.horaInicio}-${ausencia.horaFim}`}
                              </Badge>
                            ))}
                            {dia.folga && !dia.feriado ? <Badge tone="info">Extra</Badge> : null}
                            {dia.falta ? <Badge tone="danger">Falta</Badge> : null}
                            {dia.incompleto ? <Badge tone="warning">Incompleto</Badge> : null}
                            {dia.atraso ? <Badge tone="warning">Atraso</Badge> : null}
                            {!dia.falta &&
                            !dia.incompleto &&
                            !dia.atraso &&
                            (!dia.folga || dia.feriado) &&
                            dia.ausencias.length === 0 ? (
                              <Badge tone="success">
                                <CheckIcon className="h-3 w-3" /> Regular
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
