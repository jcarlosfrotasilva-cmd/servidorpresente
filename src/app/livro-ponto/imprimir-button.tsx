"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui";

export function BotaoImprimir({
  label = "Imprimir / salvar PDF",
  icon,
  variant = "accent",
}: {
  label?: string;
  icon?: ReactNode;
  variant?: "primary" | "accent" | "outline";
}) {
  return (
    <Button variant={variant} onClick={() => window.print()}>
      {icon}
      {label}
    </Button>
  );
}
