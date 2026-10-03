import { RelatoriosGestor } from "@/app/gestor/relatorios/relatorios-gestor";
import { requireGestor } from "@/lib/session";
import { currentMonth } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatórios" };

export default async function RelatoriosPage() {
  await requireGestor();
  return <RelatoriosGestor mesInicial={currentMonth()} />;
}
