import { PainelGestor } from "@/app/gestor/painel-gestor";
import { requireGestor } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visão geral" };

export default async function GestorDashboardPage() {
  const user = await requireGestor();
  return <PainelGestor nome={user.nome} />;
}
