import { JornadasGestor } from "@/app/gestor/jornadas/jornadas-gestor";
import { requireGestor } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jornadas de trabalho" };

export default async function JornadasPage() {
  await requireGestor();
  return <JornadasGestor />;
}
