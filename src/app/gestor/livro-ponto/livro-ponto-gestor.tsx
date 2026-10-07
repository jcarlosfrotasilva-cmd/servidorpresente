"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  LockIcon,
  SearchIcon,
  ShieldIcon,
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
  StatCard,
  TableWrap,
  Textarea,
} from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { formatDateTimeBR, formatDuration, formatSigned, monthLabel } from "@/lib/time";

type LivroResumo = {
  employeeId: number;
  nome: string;
  matricula: string;
  cargo: string;
  categoria: string;
  modeloNome: string | null;
  totalMinutos: number;
  esperadoMinutos: number;
  saldoMinutos: number;
  diasTrabalhados: number;
  diasFaltas: number;
  diasAusencia: number;
  diasFeriado: number;
  atrasos: number;
  fechadoEm: string | null;
  fechadoPorNome: string | null;
  protocolo: string | null;
  dias: number;
};

type Resposta = {
  mes: string;
  livros: LivroResumo[];
  podeFechar: boolean;
  totais: {
    servidores: number;
    fechados: number;
    pendentes: number;
    totalMinutos: number;
    esperadoMinutos: number;
    diasFaltas: number;
    ocorrencias: number;
  };
};

export function LivroPontoGestor({ mesInicial }: { mesInicial: string }) {
  const toast = useToast();
  const [mes, setMes] = useState(mesInicial);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "abertos" | "fechados">("todos");
  const [fechar, setFechar] = useState<LivroResumo | null>(null);
  const [ocorrencias, setOcorrencias] = useState("");
  const [processando, setProcessando] = useState(false);
  const [reabrir, setReabrir] = useState<LivroResumo | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const data = await apiFetch<Resposta>(`/api/livro-ponto?mes=${mes}`);
      setDados(data);
    } catch (error) {
      const message = (error as Error).message;
      setErro(message);
      toast.error("Falha ao carregar os livros ponto", message);
    } finally {
      setCarregando(false);
    }
  }, [mes, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const lista = useMemo(() => {
    const base = dados?.livros ?? [];
    const porBusca = busca.trim()
      ? base.filter((item) => {
          const termo = busca.toLowerCase();
          return (
            item.nome.toLowerCase().includes(termo) ||
            item.matricula.toLowerCase().includes(termo) ||
            item.cargo.toLowerCase().includes(termo)
          );
        })
      : base;
    if (filtro === "abertos") return porBusca.filter((item) => !item.fechadoEm);
    if (filtro === "fechados") return porBusca.filter((item) => item.fechadoEm);
    return porBusca;
  }, [dados, busca, filtro]);

  const confirmarFechamento = async () => {
    if (!fechar) return;
    setProcessando(true);
    try {
      await apiFetch("/api/livro-ponto/fechar", {
        method: "POST",
        body: JSON.stringify({ employeeId: fechar.employeeId, mes, ocorrencias }),
      });
      toast.success(
        "Competência fechada",
        `O Livro Ponto de ${fechar.nome} foi atestado e está pronto para arquivamento.`,
      );
      setFechar(null);
      setOcorrencias("");
      void carregar();
    } catch (error) {
      toast.error("Não foi possível fechar a competência", (error as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  const confirmarReabertura = async () => {
    if (!reabrir) return;
    setProcessando(true);
    try {
      await apiFetch(`/api/livro-ponto/fechar?employeeId=${reabrir.employeeId}&mes=${mes}`, {
        method: "DELETE",
      });
      toast.success("Competência reaberta", "Novos lançamentos e correções voltam a ser aceitos.");
      setReabrir(null);
      void carregar();
    } catch (error) {
      toast.error("Não foi possível reabrir", (error as Error).message);
    } finally {
      setProcessando(false);
    }
  };

  const totais = dados?.totais;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Livro Ponto — formulário oficial da SEE/SP"
        description="Gera o REGISTRO DE PONTO (frente e verso de consolidação) no padrão da Secretaria de Estado da Educação, já preenchido com os horários apurados, ocorrências, informações financeiras e campos de assinatura."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              type="month"
              value={mes}
              onChange={(event) => setMes(event.target.value || mesInicial)}
              className="w-[160px]"
            />
            <Link
              href={`/livro-ponto/unidade?mes=${mes}`}
              target="_blank"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
            >
              <DownloadIcon className="h-4 w-4" /> Registro de Ponto da unidade (PDF)
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Livros do mês"
          value={totais?.servidores ?? "--"}
          hint={`${totais?.fechados ?? 0} fechados · ${totais?.pendentes ?? 0} em aberto`}
          icon={<BookIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Horas apuradas"
          value={formatDuration(totais?.totalMinutos ?? 0)}
          hint={`Previsto ${formatDuration(totais?.esperadoMinutos ?? 0)}`}
          tone="info"
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Faltas injustificadas"
          value={totais?.diasFaltas ?? "--"}
          hint="Dias sem registro e sem justificativa"
          tone={(totais?.diasFaltas ?? 0) > 0 ? "warning" : "success"}
          icon={<AlertIcon className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Ocorrências registradas"
          value={totais?.ocorrencias ?? "--"}
          hint="Feriados, licenças, ausências e afastamentos"
          tone="brand"
          icon={<ShieldIcon className="h-[18px] w-[18px]" />}
        />
      </div>

      <Card>
        <div className="card-header">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar servidor, matrícula ou cargo"
                className="input pl-9"
              />
            </div>
            {(
              [
                { id: "todos" as const, label: "Todos" },
                { id: "abertos" as const, label: "Em aberto" },
                { id: "fechados" as const, label: "Fechados" },
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFiltro(item.id)}
                className={`h-11 rounded-xl px-3.5 text-[13px] font-semibold transition ${
                  filtro === item.id
                    ? "bg-brand-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:border-brand-400"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Badge tone="brand">{monthLabel(mes)}</Badge>
        </div>

        {erro ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-[13px] font-semibold text-amber-900">
              Não foi possível consultar os livros ponto: {erro}
            </p>
            <Button size="sm" variant="outline" onClick={() => void carregar()}>
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {carregando ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : lista.length === 0 ? (
          <EmptyState
            title="Nenhum livro ponto nesta competência"
            description="Confirme se os servidores estão ativos e com horário de trabalho cadastrado."
            icon={<BookIcon className="h-6 w-6" />}
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>Servidor</th>
                <th>Função / categoria</th>
                <th>Horas apuradas</th>
                <th>Saldo</th>
                <th>Faltas / ausências</th>
                <th>Atrasos</th>
                <th>Situação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((item) => (
                <tr key={item.employeeId}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar nome={item.nome} />
                      <div>
                        <p className="text-[13px] font-bold text-slate-800">{item.nome}</p>
                        <p className="text-[11px] text-slate-500">
                          Mat. {item.matricula} · RG {item.categoria}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-[12px] text-slate-600">
                    <p className="font-semibold text-slate-700">{item.cargo}</p>
                    <p className="text-slate-400">
                      {item.modeloNome ? `modelo ${item.modeloNome}` : "horário individual"}
                    </p>
                  </td>
                  <td className="text-[12px]">
                    <p className="font-semibold text-slate-700">
                      {formatDuration(item.totalMinutos)}
                    </p>
                    <p className="text-slate-400">previsto {formatDuration(item.esperadoMinutos)}</p>
                  </td>
                  <td>
                    <Badge tone={item.saldoMinutos >= 0 ? "success" : "danger"}>
                      {formatSigned(item.saldoMinutos)}
                    </Badge>
                  </td>
                  <td className="text-[12px] text-slate-600">
                    <p>
                      FI: <strong className="text-slate-700">{item.diasFaltas}</strong> · ausências:{" "}
                      <strong className="text-slate-700">{item.diasAusencia}</strong>
                    </p>
                    <p className="text-slate-400">feriados/recessos: {item.diasFeriado}</p>
                  </td>
                  <td className="text-[12px] font-semibold text-slate-700">{item.atrasos}</td>
                  <td>
                    {item.fechadoEm ? (
                      <div className="space-y-1">
                        <Badge tone="success">
                          <LockIcon className="h-3 w-3" /> Fechado
                        </Badge>
                        <p className="font-mono text-[10px] text-slate-400">{item.protocolo}</p>
                        <p className="text-[10px] text-slate-400">
                          {formatDateTimeBR(item.fechadoEm)}
                        </p>
                      </div>
                    ) : (
                      <Badge tone="warning">Em aberto</Badge>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Link
                        href={`/livro-ponto/${item.employeeId}?mes=${mes}`}
                        target="_blank"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
                        title="Frente e verso do formulário oficial + anexo demonstrativo"
                      >
                        <DownloadIcon className="h-3.5 w-3.5" /> Formulário oficial
                      </Link>
                      {item.fechadoEm ? (
                        <button
                          type="button"
                          onClick={() => setReabrir(item)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-amber-400 hover:text-amber-600"
                          title="Reabrir competência"
                        >
                          <ClockIcon className="h-3.5 w-3.5" /> Reabrir
                        </button>
                      ) : (
                        <Button
                          size="sm"
                          variant="accent"
                          onClick={() => {
                            setFechar(item);
                            setOcorrencias("");
                          }}
                        >
                          <CheckIcon className="h-3.5 w-3.5" /> Fechar competência
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
            <BookIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">
              Como funciona o fechamento da competência
            </p>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-slate-600">
              <li>
                • <strong>Página 1 (frente)</strong>: cabeçalho oficial, dados funcionais, tabela de
                dias 1 a {new Date().getDate().toString()} com Hora/Assinatura de Entrada e Saída,
                Observações, Visto do superior imediato e o quadro INFORMAÇÕES FINANCEIRAS
                (férias, GTN, ACA, serviço extraordinário, substituição eventual).
              </li>
              <li>
                • <strong>Página 2 (verso)</strong>: folha de CONSOLIDAÇÃO com linhas para as
                ocorrências do mês.
              </li>
              <li>
                • <strong>Anexo</strong>: demonstrativo eletrônico com as quatro batidas, horas
                cumpridas/previstas, saldo, códigos e o atestado da chefia imediata — subsídio para
                o preenchimento da consolidação.
              </li>
              <li>
                • Ao fechar, o sistema grava um <strong>protocolo de arquivamento</strong>, o
                responsável e a data/hora, e imprime o atestado da chefia imediata com as três
                assinaturas (servidor, diretor e conferência da organização escolar).
              </li>
              <li>
                • Depois de fechada, a competência fica identificada como definitiva — a reabertura
                é registrada na trilha de auditoria.
              </li>
              <li>
                • Use <strong>“Livro da unidade (PDF)”</strong> para gerar todos os documentos da
                escola em sequência, um por página, e arquivar o mês completo.
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <Modal
        open={Boolean(fechar)}
        onClose={() => setFechar(null)}
        title="Fechar competência do Livro Ponto"
        description={
          fechar ? `${fechar.nome} · ${monthLabel(mes)} · ${fechar.matricula}` : ""
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setFechar(null)}>
              Cancelar
            </Button>
            <Button variant="accent" loading={processando} onClick={confirmarFechamento}>
              <CheckIcon className="h-4 w-4" /> Fechar e atestar
            </Button>
          </>
        }
      >
        {fechar ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Horas cumpridas", value: formatDuration(fechar.totalMinutos) },
                { label: "Horas previstas", value: formatDuration(fechar.esperadoMinutos) },
                { label: "Saldo", value: formatSigned(fechar.saldoMinutos) },
                {
                  label: "Faltas / atrasos",
                  value: `${fechar.diasFaltas} / ${fechar.atrasos}`,
                },
                { label: "Ausências justificadas", value: String(fechar.diasAusencia) },
                { label: "Feriados e recessos", value: String(fechar.diasFeriado) },
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

            <Field
              label="Ocorrências / observações da chefia imediata"
              hint="Este texto será impresso no campo 4 do documento oficial (atestado do superior imediato)."
            >
              <Textarea
                value={ocorrencias}
                onChange={(event) => setOcorrencias(event.target.value)}
                placeholder="Ex.: Servidor participou de orientação técnica em 08/10 (OT). Saldo de horas compensado conforme art. 14 do Decreto 52.054/07. Sem demais ocorrências."
              />
            </Field>

            <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-200">
              <AlertIcon className="mr-1.5 inline h-4 w-4" />
              O fechamento gera o protocolo de arquivamento e marca a competência como definitiva.
              Você poderá reabrir caso seja necessário lançar correções.
            </p>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(reabrir)}
        onClose={() => setReabrir(null)}
        onConfirm={confirmarReabertura}
        loading={processando}
        title="Reabrir competência"
        message={`A competência de ${monthLabel(mes)} de ${
          reabrir?.nome ?? ""
        } será reaberta. O protocolo de arquivamento será removido e a ação constará na auditoria. Deseja continuar?`}
        confirmLabel="Reabrir competência"
      />
    </div>
  );
}
