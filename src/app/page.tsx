import Link from "next/link";
import { count, eq, gte } from "drizzle-orm";
import { ArrowRightIcon, CheckIcon, ClockIcon, FingerprintIcon, ShieldIcon } from "@/components/icons";
import { db } from "@/db";
import { employees, timeEntries } from "@/db/schema";
import { GESTOR_DEMO, SERVIDOR_DEMO } from "@/lib/demo";
import { ensureSeeded } from "@/lib/seed";
import { currentMonth, nowLocal } from "@/lib/time";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: FingerprintIcon,
    title: "Marcação em 4 batidas",
    text: "Entrada, saída para o almoço, retorno do almoço e saída do expediente com comprovante instantâneo.",
  },
  {
    icon: ClockIcon,
    title: "Jornadas configuráveis",
    text: "O gestor mantém horários de trabalho, dias da semana, carga diária e tolerância de atraso.",
  },
  {
    icon: ShieldIcon,
    title: "Retificação auditada",
    text: "Solicitações de correção com motivo, parecer do gestor e trilha de auditoria de cada alteração.",
  },
];

export default async function LandingPage() {
  await ensureSeeded();

  const month = currentMonth();
  const [servidoresAtivos] = await db
    .select({ total: count() })
    .from(employees)
    .where(eq(employees.ativo, true));
  const [registrosMes] = await db
    .select({ total: count() })
    .from(timeEntries)
    .where(gte(timeEntries.data, `${month}-01`));
  const user = await getCurrentUser();
  const today = nowLocal().date;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[26rem] w-[26rem] rounded-full bg-accent-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-24 h-[22rem] w-[22rem] rounded-full bg-brand-400/25 blur-3xl" />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-800 to-accent-600 text-sm font-black text-white shadow-lg">
            MF
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-brand-900">EE Profa. Marlene Frattini</p>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-600">
              Ponto Eletrônico
            </p>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          {user ? (
            <Link
              href={user.role === "GESTOR" ? "/gestor" : "/painel"}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-brand-500"
            >
              Acessar painel <ArrowRightIcon className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-brand-500"
            >
              Entrar no sistema <ArrowRightIcon className="h-4 w-4" />
            </Link>
          )}
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-700 ring-1 ring-inset ring-brand-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-accent-500" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
            </span>
            Gestão de frequência escolar
          </span>

          <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight text-brand-950 sm:text-5xl lg:text-6xl">
            Registro de ponto dos servidores,{" "}
            <span className="bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
              simples e confiável
            </span>
            .
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-600">
            Plataforma oficial da EE Profa. Marlene Frattini para cadastro de servidores,
            manutenção das jornadas de trabalho, marcação das quatro batidas diárias e
            retificação auditada de horários registrados indevidamente.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-b from-accent-500 to-accent-600 px-6 text-[15px] font-semibold text-white shadow-[var(--shadow-card)] transition hover:from-accent-400"
            >
              Acessar minha área <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <div className="flex flex-col text-xs text-slate-500">
              <span className="font-semibold text-slate-700">
                {Number(servidoresAtivos?.total ?? 0)} servidores cadastrados
              </span>
              <span>
                {Number(registrosMes?.total ?? 0)} marcações registradas em {today.slice(5, 7)}/{today.slice(0, 4)}
              </span>
            </div>
          </div>

          <ul className="mt-9 grid gap-3 sm:grid-cols-2">
            {[
              "Área exclusiva do servidor com login e senha",
              "Quatro batidas diárias com validação",
              "Solicitação de retificação com parecer do gestor",
              "Relatórios mensais e exportação em CSV",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-fade-up space-y-4">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-brand-900 to-brand-700 px-5 py-3.5 text-white">
              <p className="text-[13px] font-semibold">Espelho do dia</p>
              <p className="font-mono text-sm tabular-nums">{today.split("-").reverse().join("/")}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {[
                { label: "Entrada", hora: "07:02", tone: "text-emerald-600" },
                { label: "Saída para o almoço", hora: "11:34", tone: "text-slate-600" },
                { label: "Retorno do almoço", hora: "13:06", tone: "text-slate-600" },
                { label: "Saída do expediente", hora: "17:11", tone: "text-brand-700" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-slate-600">{row.label}</span>
                  <span className={`font-mono text-sm font-bold tabular-nums ${row.tone}`}>
                    {row.hora}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between bg-slate-50 px-5 py-3.5 text-[13px]">
              <span className="font-semibold text-slate-600">Total apurado no dia</span>
              <span className="font-bold text-slate-900">8h07</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="card p-4">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <p className="mt-3 text-[13px] font-bold text-slate-800">{feature.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{feature.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 pb-20">
        <div className="card flex flex-col gap-6 bg-white/85 p-6 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-accent-600">
              Acesso de demonstração
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Utilize as credenciais abaixo para explorar os dois perfis do sistema.
            </p>
            <div className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
              <div className="rounded-xl bg-brand-50/70 p-3">
                <p className="font-bold text-brand-800">{GESTOR_DEMO.perfil}</p>
                <p className="mt-1 font-mono text-[12px] text-slate-600">{GESTOR_DEMO.email}</p>
                <p className="font-mono text-[12px] text-slate-600">{GESTOR_DEMO.senha}</p>
              </div>
              <div className="rounded-xl bg-accent-50 p-3">
                <p className="font-bold text-accent-700">{SERVIDOR_DEMO.perfil}</p>
                <p className="mt-1 font-mono text-[12px] text-slate-600">{SERVIDOR_DEMO.email}</p>
                <p className="font-mono text-[12px] text-slate-600">{SERVIDOR_DEMO.senha}</p>
              </div>
            </div>
          </div>
          <Link
            href="/login"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 px-6 text-sm font-semibold text-white shadow-sm transition hover:from-brand-500"
          >
            Ir para o login <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
