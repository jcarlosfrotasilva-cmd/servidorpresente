import { ConferenciaGestor } from "@/app/gestor/conferencia/conferencia-gestor";
import { requireGestor } from "@/lib/session";
import { currentMonth } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conferência de frequência" };

export default async function ConferenciaPage() {
  await requireGestor();
  return <ConferenciaGestor mesInicial={currentMonth()} />;
}
