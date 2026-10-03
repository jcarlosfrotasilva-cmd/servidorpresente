import { MeusRegistros } from "@/app/painel/registros/meus-registros";
import { requireServidor } from "@/lib/session";
import { currentMonth } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meus registros" };

export default async function MeusRegistrosPage() {
  const user = await requireServidor();
  return (
    <MeusRegistros
      mesInicial={currentMonth()}
      nome={user.employeeNome ?? user.nome}
      matricula={user.matricula}
    />
  );
}
