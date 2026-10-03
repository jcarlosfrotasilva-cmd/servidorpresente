import { RetificacoesGestor } from "@/app/gestor/retificacoes/retificacoes-gestor";
import { requireGestor } from "@/lib/session";
import { currentMonth } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Retificações" };

export default async function RetificacoesPage() {
  await requireGestor();
  return <RetificacoesGestor mesInicial={currentMonth()} />;
}
