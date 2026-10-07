import { LivroPontoGestor } from "@/app/gestor/livro-ponto/livro-ponto-gestor";
import { requireGestor } from "@/lib/session";
import { currentMonth } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Livro Ponto" };

export default async function LivroPontoGestorPage() {
  await requireGestor();
  return <LivroPontoGestor mesInicial={currentMonth()} />;
}
