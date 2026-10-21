import { BancoHorasServidor } from "@/app/painel/banco-horas/banco-horas-servidor";
import { requireServidor } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu Banco de Horas" };

export default async function BancoHorasServidorPage() {
  const user = await requireServidor();
  return <BancoHorasServidor employeeId={user.employeeId as number} nome={user.employeeNome ?? user.nome} />;
}
