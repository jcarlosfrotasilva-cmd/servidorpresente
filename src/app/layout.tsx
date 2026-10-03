import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ponto Eletrônico · EE Profa. Marlene Frattini",
    template: "%s · Ponto EE Profa. Marlene Frattini",
  },
  description:
    "Sistema oficial de registro de ponto dos servidores da EE Profa. Marlene Frattini: marcações, jornadas, retificações e relatórios.",
};

export const viewport: Viewport = {
  themeColor: "#0b1926",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="app-bg text-slate-900 antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
