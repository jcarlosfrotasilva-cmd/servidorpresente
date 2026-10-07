import { ConfiguracaoGestor } from "@/app/gestor/configuracao/configuracao-gestor";
import { requireGestor } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuração" };

export default async function ConfiguracaoPage() {
  await requireGestor();
  return <ConfiguracaoGestor />;
}
