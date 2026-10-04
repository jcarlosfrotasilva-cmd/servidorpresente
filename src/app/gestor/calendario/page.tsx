import { CalendarioGestor } from "@/app/gestor/calendario/calendario-gestor";
import { requireGestor } from "@/lib/session";
import { nowLocal } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendário e ausências" };

export default async function CalendarioPage() {
  await requireGestor();
  return <CalendarioGestor anoInicial={Number(nowLocal().date.slice(0, 4))} />;
}
