import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireGestor } from "@/lib/session";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function GestorLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const user = await requireGestor();

  return (
    <AppShell
      user={{
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: "GESTOR",
        cargo: "Direção / Gestão escolar",
        matricula: null,
      }}
    >
      {children}
    </AppShell>
  );
}
