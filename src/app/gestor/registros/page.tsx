import { RegistrosGestor } from "@/app/gestor/registros/registros-gestor";
import { requireGestor } from "@/lib/session";
import { currentMonth } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registros de ponto" };

export default async function RegistrosPage() {
  await requireGestor();
  return <RegistrosGestor mesInicial={currentMonth()} />;
}
