"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  LockIcon,
  ShieldIcon,
} from "@/components/icons";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Input, SectionTitle, StatCard } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { LEGENDA_OCORRENCIAS } from "@/lib/livro-ponto-types";
import {
  formatDateBR,
  formatDateTimeBR,
  formatDuration,
  formatSigned,
  monthLabel,
} from "@/lib/time";

type Documento = {
  mes: string;
  mesLabel: string;
  competencia: string;
  protocolo: string;
  identificacao: {
    nome: string;
    matricula: string;
    rg: string;
    cpf: string;
    cargo: string;
    categoria: string;
    jornadaResumo: string;
    cargaDiaria: string;
    cargaSemanal: string;
    diasSemana: string[];
  };
  dias: {
    data: string;
    dia: string;
    diaSemana: string;
    entrada: string;
    saidaAlmoco: string;
    retornoAlmoco: string;
    saidaExpediente: string;
    horasCumpridas: number;
    horasPrevistas: number;
    saldo: number;
    codigos: string[];
    ocorrencia: string;
    naoUtil: boolean;
  }[];
  totais: {
    diasTrabalhados: number;
    diasFaltas: number;
    diasAusencia: number;
    diasFeriado: number;
    diasExtra: number;
    atrasos: number;
    incompletos: number;
    totalMinutos: number;
    esperadoMinutos: number;
    saldoMinutos: number;
  };
  fechamento: {
    protocolo: string;
    fechadoPorNome: string | null;
    fechadoEm: string;
    ocorrencias: string | null;
  } | null;
};

export function LivroPontoServidor({
  mesInicial,
  nome,
  matricula,
  employeeId,
}: {
  mesInicial: string;
  nome: string;
  matricula: string | null;
  employeeId: number;
}) {
  const toast = useToast();
  const [mes, setMes] = useState(mesInicial);
  const [documento, setDocumento] = useState<Documento | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await apiFetch<{ documento: Documento }>(`/api/livro-ponto?mes=${mes}&employeeId=meu`);
      setDocumento(data.documento);
    } catch (error) {
      toast.error("Falha ao carregar o Livro Ponto", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Meu Livro Ponto"
        description={`${nome}${matricula ? ` · Matrícula ${matricula}` : ""} · REGISTRO DE PONTO no formulário oficial da Secretaria de Estado da Educação (frente, verso de consolidação e anexo demonstrativo)`}
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              type="month"
              value={mes}
              onChange={(event) => setMes(event.target.value || mesInicial)}
              className="w-[160px]"
            />
            <Link
              href={`/livro-ponto/${employeeId}?mes=${mes}`}
              target="_blank"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-accent-500 to-accent-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-accent-400"
            >
              <DownloadIcon className="h-4 w-4" /> Baixar / imprimir PDF
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Horas em ${monthLabel(mes)}`}
          value={formatDuration(documento?.totais.totalMinutos ?? 0)}
          hint={`Previsto ${formatDuration(documento?.totais.esperadoMinutos ?? 0)}`}
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Saldo da competência"
          value={formatSigned(documento?.totais.saldoMinutos ?? 0)}
          hint={(documento?.totais.saldoMinutos ?? 0) >= 0 ? "Crédito de horas" : "Débito de horas"}
          tone={(documento?.totais.saldoMinutos ?? 0) >= 0 ? "success" : "danger"}
          icon={<BookIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Faltas / ausências"
          value={`${documento?.totais.diasFaltas ?? 0} / ${documento?.totais.diasAusencia ?? 0}`}
          hint={`${documento?.totais.atrasos ?? 0} atraso(s) · ${documento?.totais.diasFeriado ?? 0} feriado(s)`}
          tone={(documento?.totais.diasFaltas ?? 0) > 0 ? "warning" : "success"}
          icon={<AlertIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Situação do documento"
          value={documento?.fechamento ? "Fechado" : "Em aberto"}
          hint={
            documento?.fechamento
              ? `${documento.fechamento.fechadoPorNome ?? "Direção"} · ${formatDateTimeBR(
                  documento.fechamento.fechadoEm,
                )}`
              : "Aguardando fechamento pela direção"
          }
          tone={documento?.fechamento ? "success" : "warning"}
          icon={documento?.fechamento ? <LockIcon className="h-[18px] w-[18px]" /> : <ShieldIcon className="h-[18px] w-[18px]" />}
        />
      </div>

      {carregando ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : !documento || documento.dias.length === 0 ? (
        <Card>
          <EmptyState
            title="Sem apuração nesta competência"
            description="Não há registros ou dias previstos neste mês. Confirme com a direção se o seu horário de trabalho está cadastrado."
            icon={<BookIcon className="h-6 w-6" />}
          />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <div className="card-header">
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Apuração eletrônica (anexo do formulário) — {documento.mesLabel}
                </p>
                <p className="text-xs text-slate-500">
                  Protocolo <span className="font-mono">{documento.protocolo}</span> ·{" "}
                  {documento.dias.length} dia(s) no documento
                </p>
              </div>
              <Badge tone={documento.fechamento ? "success" : "warning"}>
                {documento.fechamento ? "Competência fechada" : "Competência em aberto"}
              </Badge>
            </div>
            <div className="max-h-[540px] overflow-auto p-5">
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="border border-slate-200 px-2 py-1.5 text-left">Dia</th>
                    <th className="border border-slate-200 px-2 py-1.5">Entrada</th>
                    <th className="border border-slate-200 px-2 py-1.5">Saída almoço</th>
                    <th className="border border-slate-200 px-2 py-1.5">Retorno</th>
                    <th className="border border-slate-200 px-2 py-1.5">Saída</th>
                    <th className="border border-slate-200 px-2 py-1.5">Cumpridas</th>
                    <th className="border border-slate-200 px-2 py-1.5">Código</th>
                  </tr>
                </thead>
                <tbody>
                  {documento.dias.map((dia) => (
                    <tr key={dia.data} className={dia.naoUtil ? "bg-slate-50 text-slate-500" : ""}>
                      <td className="border border-slate-200 px-2 py-1">
                        <span className="font-semibold">{formatDateBR(dia.data)}</span>
                        <span className="ml-1.5 text-[10px] text-slate-400">{dia.diaSemana}</span>
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono">
                        {dia.entrada || "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono">
                        {dia.saidaAlmoco || "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono">
                        {dia.retornoAlmoco || "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center font-mono">
                        {dia.saidaExpediente || "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-center">
                        {dia.horasCumpridas > 0 ? formatDuration(dia.horasCumpridas) : "—"}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 font-semibold">
                        {dia.codigos.length > 0 ? dia.codigos.join(" · ") : dia.naoUtil ? "" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <div className="card-header">
                <p className="text-sm font-bold text-slate-800">Dados funcionais impressos</p>
                <ShieldIcon className="h-4 w-4 text-brand-600" />
              </div>
              <ul className="divide-y divide-slate-100 text-[13px]">
                {[
                  ["Nome", documento.identificacao.nome],
                  ["RG / CPF", `${documento.identificacao.rg} · ${documento.identificacao.cpf}`],
                  ["Matrícula", documento.identificacao.matricula],
                  ["Cargo / função", documento.identificacao.cargo],
                  ["Categoria", documento.identificacao.categoria],
                  ["Horário de trabalho", documento.identificacao.diasSemana.join(", ")],
                  ["Carga horária", `${documento.identificacao.cargaDiaria} (${documento.identificacao.cargaSemanal})`],
                ].map(([label, value]) => (
                  <li key={label} className="flex items-start justify-between gap-3 px-5 py-2.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-right font-semibold text-slate-800">{value}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <div className="card-header">
                <p className="text-sm font-bold text-slate-800">Legenda dos códigos</p>
                <Badge tone="neutral">{LEGENDA_OCORRENCIAS.length}</Badge>
              </div>
              <ul className="max-h-[240px] space-y-1.5 overflow-auto px-5 py-4 text-[12px] text-slate-600">
                {LEGENDA_OCORRENCIAS.map((item) => (
                  <li key={item.codigo} className="flex gap-2">
                    <span className="w-[42px] shrink-0 font-mono font-bold text-slate-800">
                      {item.codigo}
                    </span>
                    <span>{item.descricao}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5">
              <p className="text-sm font-bold text-slate-800">Checklist para arquivamento</p>
              <ul className="mt-3 space-y-2.5 text-[13px] text-slate-600">
                {[
                  {
                    ok: documento.dias.length > 0,
                    label: "Apuração mensal gerada a partir dos registros eletrônicos",
                  },
                  {
                    ok: documento.totais.diasFaltas === 0,
                    label:
                      documento.totais.diasFaltas === 0
                        ? "Nenhuma falta injustificada na competência"
                        : `${documento.totais.diasFaltas} falta(s) injustificada(s) a justificar`,
                  },
                  {
                    ok: Boolean(documento.fechamento),
                    label: documento.fechamento
                      ? "Competência atestada e fechada pela direção"
                      : "Aguardando fechamento e atestado da chefia imediata",
                  },
                  {
                    ok: true,
                    label:
                      "Imprima frente e verso, assine todos os registros e encaminhe para o visto do superior imediato",
                  },
                ].map((item) => (
                  <li key={item.label} className="flex gap-2.5">
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                        item.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                    {item.label}
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => window.open(`/livro-ponto/${employeeId}?mes=${mes}`, "_blank")}
              >
                <DownloadIcon className="h-4 w-4" /> Abrir formulário oficial (frente e verso)
              </Button>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
