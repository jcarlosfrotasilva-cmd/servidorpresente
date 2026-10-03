"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertIcon,
  BookIcon,
  CalendarIcon,
  ChartIcon,
  ClockIcon,
  CloseIcon,
  DashboardIcon,
  LogoutIcon,
  MenuIcon,
  LockIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/icons";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/client";
import { Avatar, Button, Field, Input } from "@/components/ui";

export type ShellUser = {
  id: number;
  nome: string;
  email: string;
  role: "GESTOR" | "SERVIDOR";
  cargo: string | null;
  matricula: string | null;
};

const NAV_GESTOR = [
  { href: "/gestor", label: "Visão geral", icon: DashboardIcon },
  { href: "/gestor/servidores", label: "Servidores", icon: UsersIcon },
  { href: "/gestor/jornadas", label: "Jornadas de trabalho", icon: ClockIcon },
  { href: "/gestor/registros", label: "Registros de ponto", icon: CalendarIcon },
  { href: "/gestor/calendario", label: "Feriados e ausências", icon: ShieldIcon },
  { href: "/gestor/livro-ponto", label: "Livro ponto", icon: BookIcon },
  { href: "/gestor/configuracao", label: "Configuração", icon: SettingsIcon },
  { href: "/gestor/retificacoes", label: "Retificações", icon: AlertIcon },
  { href: "/gestor/relatorios", label: "Relatórios", icon: ChartIcon },
];

const NAV_SERVIDOR = [
  { href: "/painel", label: "Registrar ponto", icon: ClockIcon },
  { href: "/painel/registros", label: "Meus registros", icon: CalendarIcon },
  { href: "/painel/solicitacoes", label: "Retificações", icon: AlertIcon },
  { href: "/painel/livro-ponto", label: "Livro ponto", icon: BookIcon },
];

function useLiveClock() {
  const [now, setNow] = useState<{ time: string; date: string } | null>(null);

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    const tick = () => {
      const now = new Date();
      setNow({ time: formatter.format(now), date: dateFormatter.format(now) });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return now;
}

export function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const clock = useLiveClock();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => setDrawerOpen(false), [pathname]);

  const nav = user.role === "GESTOR" ? NAV_GESTOR : NAV_SERVIDOR;
  const isActive = (href: string) =>
    href === pathname || (href !== "/gestor" && href !== "/painel" && pathname.startsWith(href));

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error("Não foi possível sair", (error as Error).message);
    }
  };

  const handleChangePassword = async () => {
    setSavingPassword(true);
    try {
      await apiFetch("/api/auth/senha", {
        method: "POST",
        body: JSON.stringify({ senhaAtual: currentPassword, novaSenha: newPassword }),
      });
      toast.success("Senha alterada", "Use a nova senha nos próximos acessos.");
      setPasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      toast.error("Falha ao alterar a senha", (error as Error).message);
    } finally {
      setSavingPassword(false);
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col gap-6 bg-gradient-to-b from-brand-950 via-brand-900 to-brand-950 px-4 py-6 text-brand-100">
      <div className="flex items-center gap-3 px-2">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-accent-400 to-brand-500 text-sm font-black text-brand-950 shadow-lg">
          MF
        </span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">EE Profa. Marlene Frattini</p>
          <p className="text-[11px] uppercase tracking-widest text-accent-300">
            Registro de ponto
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                active
                  ? "bg-white/12 text-white shadow-inner ring-1 ring-inset ring-white/15"
                  : "text-brand-200/80 hover:bg-white/8 hover:text-white"
              }`}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                  active
                    ? "bg-gradient-to-br from-accent-400 to-accent-600 text-brand-950"
                    : "bg-white/8 text-brand-200 group-hover:text-white"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 rounded-2xl bg-white/8 p-3 ring-1 ring-inset ring-white/10">
        <div className="flex items-center gap-3">
          <Avatar nome={user.nome} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">{user.nome}</p>
            <p className="truncate text-[11px] text-brand-200/80">
              {user.role === "GESTOR"
                ? "Gestor escolar"
                : `${user.cargo ?? "Servidor"}${user.matricula ? ` · ${user.matricula}` : ""}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPasswordOpen(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 py-2 text-[11px] font-semibold text-brand-100 transition hover:bg-white/20"
          >
            <LockIcon className="h-3.5 w-3.5" /> Senha
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-500/85 px-2 py-2 text-[11px] font-semibold text-white transition hover:bg-rose-500"
          >
            <LogoutIcon className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-bg min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative h-full w-[280px] max-w-[85vw] animate-fade-in shadow-2xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-lg bg-white/10 p-1.5 text-white"
              aria-label="Fechar menu"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-white/60 bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 lg:hidden"
                aria-label="Abrir menu"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
              <div className="hidden sm:block">
                <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600">
                  {user.role === "GESTOR" ? "Painel do gestor" : "Área do servidor"}
                </p>
                <p className="text-[13px] font-semibold text-slate-700">
                  Secretaria Escolar Digital · Ponto Eletrônico
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-right sm:block">
                <p className="font-mono text-sm font-bold tabular-nums text-slate-800">
                  {clock?.time ?? "--:--:--"}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {clock?.date ?? "America/Sao_Paulo"}
                </p>
              </div>
              <span className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-700 ring-1 ring-inset ring-brand-200 md:inline-flex">
                <ShieldIcon className="h-3.5 w-3.5" />
                {user.role === "GESTOR" ? "Gestor" : "Servidor"}
              </span>
              <Avatar nome={user.nome} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="border-t border-slate-200/70 px-4 py-5 text-center text-[11px] text-slate-400 sm:px-6">
          EE Profa. Marlene Frattini · Sistema de Registro de Ponto Eletrônico ·
          Desenvolvido para a Secretaria Escolar · {new Date().getFullYear()}
        </footer>
      </div>

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Alterar minha senha"
        description="A senha é pessoal e intransferível. Mínimo de 8 caracteres."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={savingPassword}
              onClick={handleChangePassword}
              disabled={currentPassword.length < 4 || newPassword.length < 8}
            >
              Salvar nova senha
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Senha atual">
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="Nova senha" hint="Use letras, números e um caractere especial.">
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
