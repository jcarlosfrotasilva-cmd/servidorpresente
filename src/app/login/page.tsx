import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, CheckIcon, ShieldIcon } from "@/components/icons";
import { AlertIcon } from "@/components/icons";
import { LoginForm } from "@/app/login/login-form";
import { probeBanco } from "@/lib/db-health";
import { getCurrentUser } from "@/lib/session";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export const metadata = { title: "Acesso ao sistema" };

export default async function LoginPage() {
  const banco = await probeBanco();
  if (banco.conectado) {
    await ensureSeeded();
    const user = await getCurrentUser();
    if (user) redirect(user.role === "GESTOR" ? "/gestor" : "/painel");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-brand-400/25 blur-3xl" />

        <Link href="/" className="relative z-10 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-sm font-black text-brand-950 shadow-lg">
            MF
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold">EE Profa. Marlene Frattini</p>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-300">
              Ponto Eletrônico
            </p>
          </div>
        </Link>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-black leading-tight">
            Sua jornada registrada com transparência.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-100/80">
            Área exclusiva do servidor para registrar as quatro batidas diárias, consultar o
            espelho de ponto e solicitar retificações de horários registrados indevidamente.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-100/90">
            {[
              "Login e senha individuais por servidor",
              "Espelho de ponto sempre disponível",
              "Retificações com parecer da gestão",
              "Conformidade com a jornada de trabalho",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-500/20 text-accent-300">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-[11px] text-brand-200/70">
          Diretoria de Escola · Secretaria Escolar Digital · Uso institucional restrito
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-800 to-accent-600 text-xs font-black text-white">
              MF
            </span>
            <div className="leading-tight">
              <p className="text-[13px] font-bold text-brand-900">EE Profa. Marlene Frattini</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-600">
                Ponto Eletrônico
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-700 ring-1 ring-inset ring-brand-200">
            <ShieldIcon className="h-3.5 w-3.5" /> Ambiente seguro
          </span>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-brand-950">
            Acesse sua área
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Informe suas credenciais institucionais para continuar.
          </p>

          {!banco.conectado ? (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="flex items-center gap-2 text-[13px] font-bold text-rose-800">
                <AlertIcon className="h-4 w-4" /> Banco de dados indisponível
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-rose-700">{banco.ajuda}</p>
              <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 font-mono text-[11px] text-rose-800">
                host: {banco.host}
                {banco.pooler ? " (pooler)" : ""} · {banco.erro}
              </p>
            </div>
          ) : null}

          <LoginForm bloqueado={!banco.conectado} />

          <p className="mt-6 flex items-center gap-2 text-xs text-slate-400">
            <ArrowRightIcon className="h-3.5 w-3.5" />
            <Link href="/" className="font-semibold text-brand-600 hover:underline">
              Voltar para a página inicial
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
