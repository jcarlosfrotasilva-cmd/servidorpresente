"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  DatabaseIcon,
  DownloadIcon,
  ServerIcon,
  ShieldIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
} from "@/components/icons";
import { ConfirmDialog } from "@/components/modal";
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
  Textarea,
} from "@/components/ui";
import { apiFetch, downloadFile } from "@/lib/client";
import { BRASAO_MAX_BYTES } from "@/lib/livro-ponto-types";
import { formatDateTimeBR } from "@/lib/time";

type Config = {
  governo: string;
  secretaria: string;
  diretoria: string;
  unidade: string;
  cie: string;
  endereco: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  diretorNome: string;
  diretorRg: string;
  goeNome: string;
  secretarioNome: string;
  baseLegal: string;
  brasaoDataUrl: string | null;
  brasaoNomeArquivo: string | null;
  brasaoAlturaMm: number;
  brasaoNoVerso: boolean;
  bloquearForaDoHorario: boolean;
  margemAntesMin: number;
  margemDepoisMin: number;
  ultimoBackupEm: string | null;
  atualizadoEm: string;
  atualizadoPor: string | null;
};

type Resposta = {
  config: Config;
  estatisticas: Record<string, number>;
  limiteBrasaoBytes: number;
};

type DiagnosticoBanco = {
  info: {
    host: string;
    porta: string;
    banco: string;
    usuario: string;
    local: boolean;
    pooler: boolean;
    supabase: boolean;
    ssl: boolean;
    driver: string;
    poolMax: number;
    urlMascarada: string;
  };
  conexao: { versao: string; banco: string; usuario: string; agora: string; fuso: string } | null;
  tabelas: { tabela: string; linhas: number | null }[];
  tabelasAusentes: number;
  horaServidor: string;
  diferencaSegundos: number | null;
  pool: { total: number; ociosas: number; aguardando: number; max: number };
  demoAtivo: boolean;
  alertas: string[];
  erro: string | null;
};

type ResumoRestauracao = {
  versao: number;
  geradoEm: string;
  unidade: string;
  registros: Record<string, number>;
};

const ROTULOS_BACKUP: { chave: string; label: string }[] = [
  { chave: "servidores", label: "Servidores" },
  { chave: "horarios", label: "Horários individuais" },
  { chave: "usuarios", label: "Usuários de acesso" },
  { chave: "registrosPonto", label: "Marcações de ponto" },
  { chave: "retificacoes", label: "Retificações" },
  { chave: "ausencias", label: "Ausências" },
  { chave: "feriados", label: "Feriados / pontos facultativos" },
  { chave: "fechamentosLivroPonto", label: "Livros ponto fechados" },
  { chave: "jornadasModelo", label: "Modelos de jornada" },
  { chave: "auditoria", label: "Registros de auditoria" },
];

export function ConfiguracaoGestor() {
  const toast = useToast();
  const [aba, setAba] = useState<"escola" | "brasao" | "backup" | "banco">("escola");
  const [banco, setBanco] = useState<DiagnosticoBanco | null>(null);
  const [carregandoBanco, setCarregandoBanco] = useState(false);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [form, setForm] = useState<Config | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [removerBrasao, setRemoverBrasao] = useState(false);
  const [arquivoBackup, setArquivoBackup] = useState<{
    nome: string;
    resumo: ResumoRestauracao;
    conteudo: unknown;
  } | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [restaurando, setRestaurando] = useState(false);
  const [backupInfo, setBackupInfo] = useState<{ ultimoBackupEm: string | null } | null>(null);
  const inputBrasao = useRef<HTMLInputElement>(null);
  const inputBackup = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await apiFetch<Resposta>("/api/configuracoes");
      setDados(data);
      setForm(data.config);
      setBackupInfo({ ultimoBackupEm: data.config.ultimoBackupEm });
    } catch (error) {
      toast.error("Falha ao carregar a configuração", (error as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvarEscola = async () => {
    if (!form) return;
    setSalvando(true);
    try {
      const data = await apiFetch<{ config: Config }>("/api/configuracoes", {
        method: "PUT",
        body: JSON.stringify({
          governo: form.governo,
          secretaria: form.secretaria,
          diretoria: form.diretoria,
          unidade: form.unidade,
          cie: form.cie,
          endereco: form.endereco,
          municipio: form.municipio,
          uf: form.uf,
          cep: form.cep,
          telefone: form.telefone,
          email: form.email,
          diretorNome: form.diretorNome,
          diretorRg: form.diretorRg,
          goeNome: form.goeNome,
          secretarioNome: form.secretarioNome,
          baseLegal: form.baseLegal,
          bloquearForaDoHorario: form.bloquearForaDoHorario,
          margemAntesMin: form.margemAntesMin,
          margemDepoisMin: form.margemDepoisMin,
        }),
      });
      setDados((current) => (current ? { ...current, config: data.config } : current));
      setForm(data.config);
      toast.success(
        "Dados da escola salvos",
        "O cabeçalho do Registro de Ponto já reflete as alterações.",
      );
    } catch (error) {
      toast.error("Não foi possível salvar", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const selecionarBrasao = (arquivo: File) => {
    if (!arquivo.type.startsWith("image/")) {
      toast.error("Arquivo inválido", "Envie uma imagem PNG, JPG, WEBP ou SVG.");
      return;
    }
    if (arquivo.size > BRASAO_MAX_BYTES) {
      toast.error(
        "Imagem muito grande",
        `O limite é ${Math.round(BRASAO_MAX_BYTES / 1024)} KB. Reduza a imagem e tente novamente.`,
      );
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => {
      const dataUrl = String(leitor.result ?? "");
      setForm((current) =>
        current
          ? { ...current, brasaoDataUrl: dataUrl, brasaoNomeArquivo: arquivo.name }
          : current,
      );
      toast.push({
        kind: "info",
        title: "Brasão carregado",
        description: `${arquivo.name} — ajuste a altura impressa e clique em salvar.`,
      });
    };
    leitor.readAsDataURL(arquivo);
  };

  const salvarBrasao = async () => {
    if (!form) return;
    setSalvando(true);
    try {
      const data = await apiFetch<{ config: Config }>("/api/configuracoes", {
        method: "PUT",
        body: JSON.stringify({
          brasaoDataUrl: form.brasaoDataUrl,
          brasaoNomeArquivo: form.brasaoNomeArquivo,
          brasaoAlturaMm: form.brasaoAlturaMm,
          brasaoNoVerso: form.brasaoNoVerso,
        }),
      });
      setForm(data.config);
      setDados((current) => (current ? { ...current, config: data.config } : current));
      toast.success("Brasão atualizado", "O documento do Livro Ponto usará a nova imagem.");
    } catch (error) {
      toast.error("Não foi possível salvar o brasão", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarRemocaoBrasao = async () => {
    setSalvando(true);
    try {
      const data = await apiFetch<{ config: Config }>("/api/configuracoes", { method: "DELETE" });
      setForm(data.config);
      setDados((current) => (current ? { ...current, config: data.config } : current));
      setRemoverBrasao(false);
      toast.success("Brasão removido", "O cabeçalho volta a exibir a marca padrão do sistema.");
    } catch (error) {
      toast.error("Não foi possível remover", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const carregarBanco = useCallback(async () => {
    setCarregandoBanco(true);
    try {
      const data = await apiFetch<DiagnosticoBanco>("/api/diagnostico/banco");
      setBanco(data);
    } catch (error) {
      toast.error("Falha ao consultar o banco", (error as Error).message);
    } finally {
      setCarregandoBanco(false);
    }
  }, [toast]);

  useEffect(() => {
    if (aba === "banco" && !banco) void carregarBanco();
  }, [aba, banco, carregarBanco]);

  const baixarBackup = async () => {
    setSalvando(true);
    try {
      await downloadFile("/api/backup", `backup-ponto-${new Date().toISOString().slice(0, 10)}.json`);
      const info = await apiFetch<{ ultimoBackupEm: string | null }>("/api/backup?inspecionar=1");
      setBackupInfo(info);
      toast.success(
        "Backup gerado",
        "O arquivo JSON com todos os dados do sistema foi baixado. Guarde-o em local seguro.",
      );
    } catch (error) {
      toast.error("Não foi possível gerar o backup", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const selecionarBackup = (arquivo: File) => {
    const leitor = new FileReader();
    leitor.onload = async () => {
      try {
        const conteudo = JSON.parse(String(leitor.result ?? ""));
        const data = await apiFetch<{ resumo: ResumoRestauracao }>("/api/backup/restaurar", {
          method: "POST",
          body: JSON.stringify({ conteudo, simular: true }),
        });
        setArquivoBackup({ nome: arquivo.name, resumo: data.resumo, conteudo });
        setConfirmacao("");
      } catch (error) {
        toast.error("Arquivo recusado", (error as Error).message);
        setArquivoBackup(null);
      }
    };
    leitor.readAsText(arquivo);
  };

  const restaurar = async () => {
    if (!arquivoBackup) return;
    setRestaurando(true);
    try {
      const data = await apiFetch<{
        resumo: ResumoRestauracao;
        inseridos: Record<string, number>;
        mensagem: string;
      }>("/api/backup/restaurar", {
        method: "POST",
        body: JSON.stringify({ conteudo: arquivoBackup.conteudo, confirmacao }),
      });
      toast.success("Sistema restaurado", data.mensagem);
      setArquivoBackup(null);
      setConfirmacao("");
      void carregar();
    } catch (error) {
      toast.error("Restauração não realizada", (error as Error).message);
    } finally {
      setRestaurando(false);
    }
  };

  if (carregando || !form || !dados) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Configuração do sistema"
        description="Dados institucionais da unidade escolar, brasão do cabeçalho do Registro de Ponto e rotinas de backup e restauração."
        action={
          <Badge tone="brand">
            Atualizado em {formatDateTimeBR(form.atualizadoEm)}
            {form.atualizadoPor ? ` · ${form.atualizadoPor}` : ""}
          </Badge>
        }
      />

      <div className="flex flex-wrap gap-2.5">
        {[
          { id: "escola" as const, label: "Dados da escola", icon: UsersIcon },
          { id: "brasao" as const, label: "Brasão e identidade", icon: BookIcon },
          { id: "backup" as const, label: "Backup e restauração", icon: DatabaseIcon },
          { id: "banco" as const, label: "Banco de dados", icon: ServerIcon },
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
            </button>
          );
        })}
      </div>

      {aba === "escola" ? (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="card-header">
              <p className="text-sm font-bold text-slate-800">Dados institucionais</p>
              <Badge tone="neutral">Impressos no Registro de Ponto</Badge>
            </div>
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
              <Field label="Órgão" className="sm:col-span-2">
                <Input
                  value={form.governo}
                  onChange={(event) => setForm({ ...form, governo: event.target.value })}
                />
              </Field>
              <Field label="Secretaria" className="sm:col-span-2">
                <Input
                  value={form.secretaria}
                  onChange={(event) => setForm({ ...form, secretaria: event.target.value })}
                />
              </Field>
              <Field label="Diretoria de Ensino" className="sm:col-span-2">
                <Input
                  value={form.diretoria}
                  onChange={(event) => setForm({ ...form, diretoria: event.target.value })}
                />
              </Field>
              <Field label="Nome da unidade escolar" className="sm:col-span-2">
                <Input
                  value={form.unidade}
                  onChange={(event) => setForm({ ...form, unidade: event.target.value })}
                />
              </Field>
              <Field label="CIE / Código da unidade">
                <Input value={form.cie} onChange={(event) => setForm({ ...form, cie: event.target.value })} />
              </Field>
              <Field label="Telefone">
                <Input
                  value={form.telefone}
                  onChange={(event) => setForm({ ...form, telefone: event.target.value })}
                />
              </Field>
              <Field label="Endereço" className="sm:col-span-2">
                <Input
                  value={form.endereco}
                  onChange={(event) => setForm({ ...form, endereco: event.target.value })}
                />
              </Field>
              <Field label="Município">
                <Input
                  value={form.municipio}
                  onChange={(event) => setForm({ ...form, municipio: event.target.value })}
                />
              </Field>
              <Field label="UF">
                <Input
                  value={form.uf}
                  maxLength={2}
                  onChange={(event) => setForm({ ...form, uf: event.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="CEP">
                <Input value={form.cep} onChange={(event) => setForm({ ...form, cep: event.target.value })} />
              </Field>
              <Field label="E-mail institucional">
                <Input
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </Field>
              <Field label="Diretor(a) de Escola">
                <Input
                  value={form.diretorNome}
                  onChange={(event) => setForm({ ...form, diretorNome: event.target.value })}
                />
              </Field>
              <Field label="RG do(a) diretor(a)">
                <Input
                  value={form.diretorRg}
                  onChange={(event) => setForm({ ...form, diretorRg: event.target.value })}
                />
              </Field>
              <Field label="Gerente de Organização Escolar" hint="Conferência da frequência.">
                <Input
                  value={form.goeNome}
                  onChange={(event) => setForm({ ...form, goeNome: event.target.value })}
                />
              </Field>
              <Field label="Secretário(a) de Escola">
                <Input
                  value={form.secretarioNome}
                  onChange={(event) => setForm({ ...form, secretarioNome: event.target.value })}
                />
              </Field>
              <Field
                label="Base legal impressa no rodapé"
                className="sm:col-span-2"
                hint="Ex.: Decreto nº 52.054/2007, Instrução UCRH 1/2007 e Comunicado CGRH."
              >
                <Textarea
                  value={form.baseLegal}
                  onChange={(event) => setForm({ ...form, baseLegal: event.target.value })}
                />
              </Field>
            </div>
            <div className="border-t border-slate-100 px-5 py-5">
              <div className="flex items-center gap-2.5">
                <ClockIcon className="h-4 w-4 text-brand-600" />
                <p className="text-[13px] font-bold text-slate-700">
                  Regras de registro de ponto
                </p>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <Field label="Margem antes da entrada (min)" hint="Antecedência liberada para bater o ponto.">
                  <Input
                    type="number"
                    min={0}
                    max={240}
                    value={form.margemAntesMin}
                    onChange={(event) =>
                      setForm({ ...form, margemAntesMin: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Margem após a saída (min)" hint="Tempo liberado depois do horário de saída.">
                  <Input
                    type="number"
                    min={0}
                    max={300}
                    value={form.margemDepoisMin}
                    onChange={(event) =>
                      setForm({ ...form, margemDepoisMin: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Bloqueio de horário" hint="Recomendado manter ativo.">
                  <Select
                    value={form.bloquearForaDoHorario ? "sim" : "nao"}
                    onChange={(event) =>
                      setForm({ ...form, bloquearForaDoHorario: event.target.value === "sim" })
                    }
                  >
                    <option value="sim">Ativo — só registra no dia/horário cadastrado</option>
                    <option value="nao">Desativado — permite registro livre</option>
                  </Select>
                </Field>
              </div>
              <p className="mt-3 rounded-xl bg-brand-50 px-3.5 py-3 text-[12px] text-brand-900 ring-1 ring-inset ring-brand-100">
                Exemplo: servidor com expediente das <strong>07:00 às 17:00</strong>, margens de{" "}
                <strong>{form.margemAntesMin}</strong> e <strong>{form.margemDepoisMin}</strong>{" "}
                minutos → a janela de registro fica de{" "}
                <strong className="font-mono">
                  {String(
                    Math.max(
                      0,
                      Math.floor((420 - Number(form.margemAntesMin)) / 60),
                    ),
                  ).padStart(2, "0")}
                  :{String(Math.max(0, 420 - Number(form.margemAntesMin)) % 60).padStart(2, "0")}
                </strong>{" "}
                às{" "}
                <strong className="font-mono">
                  {String(
                    Math.min(23, Math.floor((1020 + Number(form.margemDepoisMin)) / 60)),
                  ).padStart(2, "0")}
                  :{String(Math.min(59, (1020 + Number(form.margemDepoisMin)) % 60)).padStart(2, "0")}
                </strong>
                . Em dias sem expediente cadastrado (sábados, domingos ou feriados) o registro é
                bloqueado.
              </p>
            </div>
            <div className="flex justify-end border-t border-slate-100 px-5 py-4">
              <Button onClick={salvarEscola} loading={salvando}>
                <CheckIcon className="h-4 w-4" /> Salvar dados da escola
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-bold text-slate-800">Pré-visualização do cabeçalho</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Como o Registro de Ponto será impresso para arquivamento.
            </p>
            <div className="mt-4 border border-slate-300 p-3 text-[10px] leading-snug">
              <div className="flex items-center gap-3 border border-black p-2">
                <div className="flex w-[52px] shrink-0 items-center justify-center border-r border-black pr-2">
                  {form.brasaoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.brasaoDataUrl}
                      alt="Brasão"
                      style={{ height: `${form.brasaoAlturaMm * 1.6}px` }}
                      className="object-contain"
                    />
                  ) : (
                    <div
                      className="grid w-[40px] place-items-center border border-slate-300 text-center text-[7px] font-bold text-slate-400"
                      style={{ height: `${form.brasaoAlturaMm * 1.6}px` }}
                    >
                      BRASÃO
                    </div>
                  )}
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[9px] font-bold">{form.governo}</p>
                  <p className="text-[8px] font-semibold">{form.secretaria}</p>
                  <p className="text-[7px]">
                    {form.diretoria} · UNIDADE: {form.unidade} — {form.cie}
                  </p>
                  <p className="mt-0.5 text-[9px] font-bold">
                    REGISTRO DE PONTO MÊS/ANO: {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).toUpperCase()}
                  </p>
                </div>
                <p className="text-[8px] font-bold">PÁG. 1</p>
              </div>
              <p className="mt-2 text-[7px] text-slate-500">
                Endereço: {form.endereco} — {form.municipio}/{form.uf} · CEP {form.cep} · Tel.{" "}
                {form.telefone}
              </p>
            </div>
            <ul className="mt-4 space-y-2 text-[12px] text-slate-600">
              <li className="flex gap-2">
                <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                Os dados são usados no cabeçalho, no rodapé legal e nas assinaturas do documento.
              </li>
              <li className="flex gap-2">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                Confira o CIE e o nome da unidade: são informações de identificação oficial.
              </li>
            </ul>
          </Card>
        </div>
      ) : null}

      {aba === "brasao" ? (
        <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
          <Card>
            <div className="card-header">
              <p className="text-sm font-bold text-slate-800">Brasão da unidade / SEE-SP</p>
              <Badge tone={form.brasaoDataUrl ? "success" : "warning"}>
                {form.brasaoDataUrl ? "Imagem carregada" : "Nenhuma imagem"}
              </Badge>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={inputBrasao}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(event) => {
                    const arquivo = event.target.files?.[0];
                    if (arquivo) selecionarBrasao(arquivo);
                    event.target.value = "";
                  }}
                />
                <Button variant="outline" onClick={() => inputBrasao.current?.click()}>
                  <UploadIcon className="h-4 w-4" /> Selecionar arquivo
                </Button>
                {form.brasaoDataUrl ? (
                  <Button variant="ghost" onClick={() => setRemoverBrasao(true)}>
                    <TrashIcon className="h-4 w-4" /> Remover brasão
                  </Button>
                ) : null}
                <span className="text-[11px] text-slate-400">
                  PNG, JPG, WEBP ou SVG · até {Math.round(dados.limiteBrasaoBytes / 1024)} KB ·
                  recomendado 300 × 300 px
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Posição no documento"
                  hint="O cabeçalho mantém o padrão do formulário oficial: brasão no topo, à esquerda."
                >
                  <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-semibold text-slate-600">
                    Fixa — canto superior esquerdo
                  </div>
                </Field>
                <Field
                  label={`Altura impressa: ${form.brasaoAlturaMm} mm`}
                  hint="8 mm (discreto) a 45 mm (destacado)."
                >
                  <input
                    type="range"
                    min={8}
                    max={45}
                    step={1}
                    value={form.brasaoAlturaMm}
                    onChange={(event) =>
                      setForm({ ...form, brasaoAlturaMm: Number(event.target.value) })
                    }
                    className="mt-2 w-full accent-brand-600"
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={form.brasaoNoVerso}
                  onChange={(event) => setForm({ ...form, brasaoNoVerso: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                Repetir o brasão no verso (folha de consolidação)
              </label>

              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Pré-visualização — brasão no topo, à esquerda
                </p>
                <div className="mt-3 flex items-center gap-4 border border-slate-300 bg-white p-4">
                  <div className="grid w-[70px] place-items-center border-r border-slate-300 pr-3">
                    {form.brasaoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.brasaoDataUrl}
                        alt="Brasão"
                        style={{ height: `${form.brasaoAlturaMm * 2}px` }}
                        className="object-contain"
                      />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center border border-slate-300 text-[9px] font-bold text-slate-400">
                        SEM
                        <br />
                        BRASÃO
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-center text-[10px] text-slate-600">
                    <p className="font-bold uppercase">{form.unidade}</p>
                    <p>REGISTRO DE PONTO MÊS/ANO</p>
                  </div>
                  <p className="text-[9px] font-bold text-slate-500">PÁG. 1</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
              <p className="text-[11px] text-slate-400">
                Arquivo: {form.brasaoNomeArquivo ?? "nenhum"}
              </p>
              <Button onClick={salvarBrasao} loading={salvando} disabled={!form.brasaoDataUrl}>
                <CheckIcon className="h-4 w-4" /> Salvar brasão e posição
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-bold text-slate-800">Recomendações para a imagem</p>
            <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-slate-600">
              <li>• Use o brasão oficial em PNG com fundo transparente para melhor impressão.</li>
              <li>• Tamanho sugerido: 300 × 300 px, até 500 KB.</li>
              <li>• O brasão ocupa a faixa esquerda do cabeçalho, exatamente como no formulário oficial da SEE.</li>
              <li>• A largura da faixa é fixa; a altura escolhida é aplicada em milímetros na impressão.</li>
              <li>• Sem imagem, o cabeçalho exibe a marca “SIP / Governo do Estado de São Paulo” no mesmo lugar.</li>
            </ul>
          </Card>
        </div>
      ) : null}

      {aba === "backup" ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Servidores"
              value={dados.estatisticas.funcionarios ?? 0}
              hint={`${dados.estatisticas.horarios ?? 0} horários individuais`}
              icon={<UsersIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Marcações de ponto"
              value={dados.estatisticas.registros ?? 0}
              hint={`${dados.estatisticas.retificacoes ?? 0} retificações · ${dados.estatisticas.ausencias ?? 0} ausências`}
              tone="info"
              icon={<DatabaseIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Feriados / fechamentos"
              value={`${dados.estatisticas.feriados ?? 0} / ${dados.estatisticas.fechamentos ?? 0}`}
              hint="Datas de calendário e livros ponto fechados"
              tone="brand"
              icon={<BookIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Último backup"
              value={backupInfo?.ultimoBackupEm ? formatDateTimeBR(backupInfo.ultimoBackupEm) : "Não realizado"}
              hint={`${dados.estatisticas.auditoria ?? 0} eventos de auditoria`}
              tone={backupInfo?.ultimoBackupEm ? "success" : "warning"}
              icon={<ShieldIcon className="h-[18px] w-[18px]" />}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <div className="card-header">
                <p className="text-sm font-bold text-slate-800">Gerar backup completo</p>
                <Badge tone="success">JSON</Badge>
              </div>
              <div className="space-y-4 px-5 py-5">
                <p className="text-[13px] leading-relaxed text-slate-600">
                  O arquivo inclui <strong>todos</strong> os dados do sistema: configuração da escola
                  (com o brasão), servidores, horários individuais, usuários e senhas, marcações de
                  ponto, retificações, ausências, feriados, livros ponto fechados e a trilha de
                  auditoria.
                </p>
                <ul className="grid grid-cols-2 gap-1.5 text-[12px] text-slate-600">
                  {ROTULOS_BACKUP.map((item) => (
                    <li key={item.chave} className="flex items-center gap-1.5">
                      <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                      {item.label}
                    </li>
                  ))}
                </ul>
                <Button onClick={baixarBackup} loading={salvando}>
                  <DownloadIcon className="h-4 w-4" /> Baixar backup agora
                </Button>
                <p className="text-[11px] text-slate-400">
                  Recomendação: geração mensal após o fechamento dos livros ponto, guardando o
                  arquivo na pasta da secretaria escolar.
                </p>
              </div>
            </Card>

            <Card>
              <div className="card-header">
                <p className="text-sm font-bold text-slate-800">Restaurar a partir de um backup</p>
                <Badge tone="warning">Substitui os dados atuais</Badge>
              </div>
              <div className="space-y-4 px-5 py-5">
                <input
                  ref={inputBackup}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const arquivo = event.target.files?.[0];
                    if (arquivo) selecionarBackup(arquivo);
                    event.target.value = "";
                  }}
                />
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center">
                  <p className="text-[13px] font-semibold text-slate-700">
                    Selecione o arquivo <span className="font-mono">.json</span> do backup
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    O sistema valida o arquivo e mostra um resumo antes de restaurar.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => inputBackup.current?.click()}
                  >
                    <UploadIcon className="h-4 w-4" /> Escolher arquivo
                  </Button>
                </div>

                {arquivoBackup ? (
                  <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-200">
                    <p className="text-[13px] font-bold text-amber-900">
                      {arquivoBackup.nome}
                    </p>
                    <p className="mt-0.5 text-[12px] text-amber-800">
                      {arquivoBackup.resumo.unidade} · gerado em{" "}
                      {formatDateTimeBR(arquivoBackup.resumo.geradoEm)}
                    </p>
                    <ul className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-amber-900">
                      {ROTULOS_BACKUP.map((item) => (
                        <li key={item.chave}>
                          {item.label}:{" "}
                          <strong>{arquivoBackup.resumo.registros[item.chave] ?? 0}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <Field
                  label={`Digite ${"RESTAURAR"} para confirmar`}
                  hint="A restauração apaga os dados atuais e reinsere os do arquivo (sessões de acesso são mantidas)."
                >
                  <Input
                    value={confirmacao}
                    onChange={(event) => setConfirmacao(event.target.value.toUpperCase())}
                    placeholder="RESTAURAR"
                  />
                </Field>

                <Button
                  variant="danger"
                  loading={restaurando}
                  disabled={!arquivoBackup || confirmacao !== "RESTAURAR"}
                  onClick={restaurar}
                >
                  <UploadIcon className="h-4 w-4" /> Restaurar sistema
                </Button>
              </div>
            </Card>
          </div>

          {!backupInfo?.ultimoBackupEm ? (
            <Card>
              <EmptyState
                title="Nenhum backup gerado até agora"
                description="Gere o primeiro backup para proteger os registros de ponto e os fechamentos do Livro Ponto."
                icon={<DatabaseIcon className="h-6 w-6" />}
                action={
                  <Button variant="outline" onClick={baixarBackup}>
                    <DownloadIcon className="h-4 w-4" /> Gerar backup agora
                  </Button>
                }
              />
            </Card>
          ) : null}
        </div>
      ) : null}

      {aba === "banco" ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Conexão"
              value={
                banco
                  ? banco.info.pooler
                    ? "Pooler"
                    : banco.info.local
                      ? "Local"
                      : "Direta"
                  : "--"
              }
              hint={banco ? banco.info.urlMascarada : "Consultando…"}
              tone={banco?.erro ? "danger" : "success"}
              icon={<ServerIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="SSL"
              value={banco ? (banco.info.ssl ? "Ativo" : "Desativado") : "--"}
              hint={banco ? `Driver: ${banco.info.driver} · pool ${banco.pool.max}` : ""}
              tone={banco?.info.ssl ? "success" : "warning"}
              icon={<ShieldIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Tabelas do sistema"
              value={banco ? `${banco.tabelas.length - banco.tabelasAusentes}/12` : "--"}
              hint={
                banco?.tabelasAusentes
                  ? `${banco.tabelasAusentes} ausente(s) — execute o SQL`
                  : "Estrutura completa"
              }
              tone={banco?.tabelasAusentes ? "warning" : "success"}
              icon={<DatabaseIcon className="h-[18px] w-[18px]" />}
            />
            <StatCard
              label="Relógio do banco"
              value={
                banco?.diferencaSegundos != null
                  ? `${banco.diferencaSegundos >= 0 ? "+" : ""}${banco.diferencaSegundos}s`
                  : "--"
              }
              hint={banco?.conexao ? `Fuso ${banco.conexao.fuso} · PostgreSQL ${banco.conexao.versao.split(" ")[1] ?? ""}` : ""}
              tone={Math.abs(banco?.diferencaSegundos ?? 0) > 120 ? "warning" : "success"}
              icon={<ClockIcon className="h-[18px] w-[18px]" />}
            />
          </div>

          {banco?.alertas?.length ? (
            <Card className="p-5">
              <p className="text-sm font-bold text-slate-800">Avisos do ambiente</p>
              <ul className="mt-2.5 space-y-1.5 text-[13px] text-slate-600">
                {banco.alertas.map((item) => (
                  <li key={item} className="flex gap-2">
                    <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
            <Card>
              <div className="card-header">
                <p className="text-sm font-bold text-slate-800">Passo a passo — migrar para o Supabase</p>
                <Badge tone="brand">PostgreSQL gerenciado</Badge>
              </div>
              <ol className="space-y-3 px-5 py-5 text-[13px] leading-relaxed text-slate-600">
                {[
                  "Crie o projeto no Supabase e guarde a senha do banco escolhida no momento da criação.",
                  "Em Project Settings → Database, copie a connection string do Connection Pooler (Session pooler, porta 5432) — ela já vem no formato postgresql://postgres.PROJETO:SENHA@aws-0-REGIAO.pooler.supabase.com:5432/postgres.",
                  "No SQL Editor do Supabase, cole o conteúdo do arquivo drizzle/0000_sour_johnny_storm.sql (schema completo: 12 tabelas, enums e índices) e execute.",
                  "Configure a variável de ambiente DATABASE_URL com essa connection string (e mantenha DATABASE_SSL=true se preferir explícito).",
                  "Reinicie a aplicação. O sistema detecta o banco remoto, ativa SSL, reduz o pool e não cria dados de demonstração.",
                  "Acesse com o usuário de gestão (criado automaticamente no primeiro acesso) e troque a senha em Configuração.",
                  "Traga os dados atuais usando o backup: gere o arquivo aqui nesta aba e restaure no ambiente novo.",
                ].map((passo, index) => (
                  <li key={passo} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                    {passo}
                  </li>
                ))}
              </ol>
              <div className="border-t border-slate-100 px-5 py-4">
                <p className="text-[12px] text-slate-500">
                  Credenciais iniciais de gestão (produção):{" "}
                  <span className="font-mono">
                    {process.env.NEXT_PUBLIC_GESTOR_EMAIL ?? "gestor@marlenefrattini.sp.gov.br"}
                  </span>{" "}
                  — a senha pode ser definida com a variável <span className="font-mono">GESTOR_SENHA</span>{" "}
                  antes do primeiro acesso.
                </p>
              </div>
            </Card>

            <Card>
              <div className="card-header">
                <p className="text-sm font-bold text-slate-800">Tabelas e volume de dados</p>
                <Button variant="outline" size="sm" loading={carregandoBanco} onClick={carregarBanco}>
                  Atualizar
                </Button>
              </div>
              <div className="max-h-[420px] overflow-auto px-5 py-4">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="pb-2">Tabela</th>
                      <th className="pb-2 text-right">Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(banco?.tabelas ?? []).map((item) => (
                      <tr key={item.tabela} className="border-t border-slate-100">
                        <td className="py-1.5 font-mono text-[11px] text-slate-700">
                          {item.tabela}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-slate-700">
                          {item.linhas == null ? (
                            <span className="text-amber-600">ausente</span>
                          ) : (
                            item.linhas.toLocaleString("pt-BR")
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!banco ? (
                  <p className="py-6 text-center text-[13px] text-slate-500">
                    Consultando o banco de dados…
                  </p>
                ) : null}
                {banco?.conexao ? (
                  <p className="mt-3 text-[11px] text-slate-400">
                    Banco <span className="font-mono">{banco.conexao.banco}</span> · usuário{" "}
                    <span className="font-mono">{banco.conexao.usuario}</span> · conexões do pool:{" "}
                    {banco.pool.total} ativas / {banco.pool.ociosas} ociosas (máx. {banco.pool.max})
                  </p>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={removerBrasao}
        onClose={() => setRemoverBrasao(false)}
        onConfirm={confirmarRemocaoBrasao}
        loading={salvando}
        title="Remover o brasão"
        message="A imagem será excluída da configuração e o cabeçalho do Registro de Ponto voltará a exibir a marca padrão. Deseja continuar?"
        confirmLabel="Remover imagem"
      />

    </div>
  );
}
