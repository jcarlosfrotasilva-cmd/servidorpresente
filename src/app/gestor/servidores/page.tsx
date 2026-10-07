import { ServidoresGestor } from "@/app/gestor/servidores/servidores-gestor";
import { requireGestor } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Servidores" };

export default async function ServidoresPage() {
  await requireGestor();
  return <ServidoresGestor />;
}
