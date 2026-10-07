"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/toast";
import { LockIcon } from "@/components/icons";
import { apiFetch } from "@/lib/client";
import { GESTOR_DEMO, SERVIDOR_DEMO } from "@/lib/demo";

const DEMOS = [
  {
    label: "Entrar como gestor",
    email: GESTOR_DEMO.email,
    senha: GESTOR_DEMO.senha,
    tone: "bg-brand-50 text-brand-700 ring-brand-200",
  },
  {
    label: "Entrar como servidor",
    email: SERVIDOR_DEMO.email,
    senha: SERVIDOR_DEMO.senha,
    tone: "bg-accent-50 text-accent-700 ring-accent-200",
  },
];

export function LoginForm({ bloqueado = false }: { bloqueado?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (credentials?: { email: string; senha: string }) => {
    const loginEmail = credentials?.email ?? email;
    const loginSenha = credentials?.senha ?? senha;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ role: "GESTOR" | "SERVIDOR"; nome: string }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email: loginEmail, senha: loginSenha }),
        },
      );
      toast.success(`Bem-vindo(a), ${data.nome.split(" ")[0]}!`, "Acesso liberado com sucesso.");
      router.replace(data.role === "GESTOR" ? "/gestor" : "/painel");
      router.refresh();
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast.error("Não foi possível entrar", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-7">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="E-mail institucional">
          <Input
            type="email"
            required
            autoComplete="username"
            placeholder="nome@marlenefrattini.sp.gov.br"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
          />
        </Field>

        {error ? (
          <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={loading} disabled={bloqueado} className="w-full">
          <LockIcon className="h-4 w-4" /> Entrar no sistema
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> ou <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {DEMOS.map((demo) => (
          <button
            key={demo.email}
            type="button"
            disabled={loading || bloqueado}
            onClick={() => {
              setEmail(demo.email);
              setSenha(demo.senha);
              void submit({ email: demo.email, senha: demo.senha });
            }}
            className={`rounded-xl px-3 py-2.5 text-[12px] font-semibold ring-1 ring-inset transition hover:brightness-[0.98] disabled:opacity-60 ${demo.tone}`}
          >
            {demo.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-slate-400">
        Acesso de demonstração: senha padrão dos servidores{" "}
        <strong>{SERVIDOR_DEMO.senha}</strong>
      </p>
    </div>
  );
}
