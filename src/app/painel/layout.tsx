import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireServidor } from "@/lib/session";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const user = await requireServidor();

  return (
    <AppShell
      user={{
        id: user.id,
        nome: user.employeeNome ?? user.nome,
        email: user.email,
        role: "SERVIDOR",
        cargo: user.cargo,
        matricula: user.matricula,
      }}
    >
      {children}
    </AppShell>
  );
}
