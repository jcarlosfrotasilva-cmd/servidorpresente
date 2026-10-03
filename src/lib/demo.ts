export const DOMINIO_INSTITUCIONAL = "marlenefrattini.sp.gov.br";

export const GESTOR_DEMO = {
  nome: "Diretoria — EE Profa. Marlene Frattini",
  email: `gestor@${DOMINIO_INSTITUCIONAL}`,
  senha: "Gestor@2025",
  perfil: "Gestor escolar",
} as const;

export const SERVIDOR_DEMO = {
  nome: "Ana Paula Souza",
  email: `ana.souza@${DOMINIO_INSTITUCIONAL}`,
  senha: "Servidor@2025",
  perfil: "Servidor",
} as const;

export function emailInstitucional(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return `${slug}@${DOMINIO_INSTITUCIONAL}`;
}
