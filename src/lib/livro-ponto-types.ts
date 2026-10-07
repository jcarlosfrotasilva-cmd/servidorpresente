/**
 * Dados institucionais e vocabulário oficial do Livro Ponto
 * (Decreto nº 52.054/2007, Instrução UCRH 1/2007 e CGRH/SEE-SP).
 * Arquivo livre de dependências do banco para uso no cliente e no servidor.
 */

export type EscolaConfig = {
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
};

export const ESCOLA_PADRAO: EscolaConfig = {
  governo: "GOVERNO DO ESTADO DE SÃO PAULO",
  secretaria: "SECRETARIA DE ESTADO DA EDUCAÇÃO",
  diretoria: "DIRETORIA DE ENSINO — REGIÃO DE SÃO PAULO",
  unidade: "EE PROFA. MARLENE FRATTINI",
  cie: "CIE 012345",
  endereco: "Rua das Acácias, nº 1000 — Jardim Escola",
  municipio: "São Paulo",
  uf: "SP",
  cep: "00000-000",
  telefone: "(11) 0000-0000",
  email: "e000000a@educacao.sp.gov.br",
  diretorNome: "Direção da unidade escolar",
  diretorRg: "",
  goeNome: "",
  secretarioNome: "",
  baseLegal:
    "Decreto nº 52.054/2007, Instrução UCRH 1/2007 e Comunicado CGRH — registro de ponto dos servidores da Secretaria da Educação",
  brasaoDataUrl: null,
  brasaoNomeArquivo: null,
  brasaoAlturaMm: 20,
  brasaoNoVerso: true,
  bloquearForaDoHorario: true,
  margemAntesMin: 60,
  margemDepoisMin: 120,
};

/** Compatibilidade: dados institucionais padrão. */
export const ESCOLA = {
  governo: ESCOLA_PADRAO.governo,
  secretaria: ESCOLA_PADRAO.secretaria,
  diretoria: ESCOLA_PADRAO.diretoria,
  unidade: ESCOLA_PADRAO.unidade,
  cie: ESCOLA_PADRAO.cie,
  endereco: `${ESCOLA_PADRAO.endereco} — ${ESCOLA_PADRAO.municipio}/${ESCOLA_PADRAO.uf}`,
  telefone: ESCOLA_PADRAO.telefone,
  documento: "LIVRO PONTO",
  baseLegal: ESCOLA_PADRAO.baseLegal,
};

export const BRASAO_MAX_BYTES = 500 * 1024;

export const CATEGORIAS = [
  { value: "EFETIVO", label: "Titular de Cargo (Efetivo)" },
  { value: "ATIVO_FUNCAO", label: "Ocupante de Função-Atividade" },
  { value: "ACT", label: "Admitido em Caráter Temporário (ACT)" },
  { value: "TERCEIRIZADO", label: "Serviço terceirizado" },
  { value: "ESTAGIARIO", label: "Estagiário" },
];

export function categoriaLabel(value?: string | null): string {
  return CATEGORIAS.find((item) => item.value === value)?.label ?? "Titular de Cargo (Efetivo)";
}

/** Códigos oficiais de ocorrência usados na coluna "Faltas / ocorrências". */
export type CodigoOcorrencia = {
  codigo: string;
  descricao: string;
  /** sigla aplicada nos dias em que a ocorrência aparece */
  aplicacao: string;
};

export const LEGENDA_OCORRENCIAS: CodigoOcorrencia[] = [
  { codigo: "FI", descricao: "Falta injustificada (sem registro no ponto)", aplicacao: "Ausência de registro em dia de expediente" },
  { codigo: "FJ", descricao: "Falta justificada", aplicacao: "Ausência cadastrada e autorizada pela direção" },
  { codigo: "FÉ", descricao: "Férias", aplicacao: "Período de férias regulamentares" },
  { codigo: "LS", descricao: "Licença saúde", aplicacao: "Licença para tratamento de saúde / perícia médica" },
  { codigo: "LP", descricao: "Licença-prêmio", aplicacao: "Gozo de licença-prêmio" },
  { codigo: "DO", descricao: "Afastamento por doença (certificado médico)", aplicacao: "Doença comprovada por atestado" },
  { codigo: "AT", descricao: "Atestado médico — ausência parcial", aplicacao: "Ausência em faixa de horário do dia" },
  { codigo: "OT", descricao: "Orientação técnica / treinamento", aplicacao: "Convocação ou hipótese prevista no art. 13 do Decreto 52.054/07" },
  { codigo: "FC", descricao: "Folga / banco de horas (compensação)", aplicacao: "Horas excedentes compensadas nos termos do art. 14" },
  { codigo: "SP", descricao: "Suspensão", aplicacao: "Suspensão administrativa" },
  { codigo: "FER", descricao: "Feriado", aplicacao: "Feriado legal (nacional, estadual ou municipal)" },
  { codigo: "PF", descricao: "Ponto facultativo", aplicacao: "Data com ponto facultativo na unidade escolar" },
  { codigo: "REC", descricao: "Recesso escolar", aplicacao: "Período de recesso conforme calendário escolar" },
  { codigo: "SUS", descricao: "Suspensão de expediente", aplicacao: "Suspensão de aulas/expediente definida pela Administração" },
  { codigo: "HE", descricao: "Hora suplementar / serviço extraordinário", aplicacao: "Horas cumpridas fora da jornada estabelecida" },
  { codigo: "A", descricao: "Atraso na entrada", aplicacao: "Entrada após a tolerância do horário de trabalho" },
  { codigo: "S", descricao: "Saldo de horas positivo no dia", aplicacao: "Excedente diário de horas" },
  { codigo: "-", descricao: "Saldo de horas negativo no dia", aplicacao: "Horas não cumpridas no dia" },
  { codigo: "OB", descricao: "Outros — verificar observação lançada pela direção", aplicacao: "Ausência do tipo “outros”" },
];

export const LEGENDA_POR_ARQUIVO: Record<string, { codigo: string; descricao: string }> = {
  FERIAS: { codigo: "FÉ", descricao: "Férias (dia integral)" },
  LICENCA_SAUDE: { codigo: "LS", descricao: "Licença saúde (dia integral)" },
  LICENCA_PREMIO: { codigo: "LP", descricao: "Licença-prêmio (dia integral)" },
  ORIENTACAO_TECNICA: { codigo: "OT", descricao: "Orientação técnica (dia integral)" },
  DOENCA: { codigo: "DO", descricao: "Afastamento por doença (dia integral)" },
  ATESTADO: { codigo: "AT", descricao: "Atestado médico (ausência parcial)" },
  FALTA_JUSTIFICADA: { codigo: "FJ", descricao: "Falta justificada" },
  FOLGA_COMPENSACAO: { codigo: "FC", descricao: "Folga/compensação (dia integral)" },
  SUSPENSAO: { codigo: "SP", descricao: "Suspensão (dia integral)" },
  OUTROS: { codigo: "OB", descricao: "Outros afastamentos — conforme observação" },
};

export const LEGENDA_POR_FERIADO: Record<string, { codigo: string; descricao: string }> = {
  FERIADO: { codigo: "FER", descricao: "Feriado" },
  PONTO_FACULTATIVO: { codigo: "PF", descricao: "Ponto facultativo" },
  RECESSO: { codigo: "REC", descricao: "Recesso escolar" },
  SUSPENSAO: { codigo: "SUS", descricao: "Suspensão de expediente" },
};

export const MESES_EXTENSO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function competenciaLabel(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${MESES_EXTENSO[Number(m) - 1] ?? ""}/${ano}`;
}

/** Protocolo de arquivamento determinístico (rastreabilidade do documento). */
export function protocoloLivroPonto(employeeId: number, mes: string, totalMinutos: number): string {
  const base = `${employeeId}|${mes}|${totalMinutos}|MFS`;
  let hash = 2166136261;
  for (let i = 0; i < base.length; i += 1) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return `LP-${mes.replace("-", "")}-${String(employeeId).padStart(4, "0")}-${hex}`;
}

export function horasDecimais(minutos: number): string {
  return (minutos / 60).toFixed(2).replace(".", ",");
}

export function horasExtenso(minutos: number): string {
  const abs = Math.abs(minutos);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${h}h${String(m).padStart(2, "0")}min`;
}
