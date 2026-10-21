import { BancoHorasGestor } from "@/app/gestor/banco-horas/banco-horas-gestor";
import { requireGestor } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Banco de Horas" };

export default async function BancoHorasPage() {
  await requireGestor();
  return <BancoHorasGestor />;
}
