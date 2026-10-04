import { LivroPontoServidor } from "@/app/painel/livro-ponto/livro-ponto-servidor";
import { requireServidor } from "@/lib/session";
import { currentMonth } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu Livro Ponto" };

export default async function MeuLivroPontoPage() {
  const user = await requireServidor();
  return (
    <LivroPontoServidor
      mesInicial={currentMonth()}
      nome={user.employeeNome ?? user.nome}
      matricula={user.matricula}
      employeeId={user.employeeId as number}
    />
  );
}
