import { SolicitacoesServidor } from "@/app/painel/solicitacoes/solicitacoes-servidor";
import { requireServidor } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minhas retificações" };

export default async function SolicitacoesPage() {
  const user = await requireServidor();
  return <SolicitacoesServidor nome={user.employeeNome ?? user.nome} />;
}
