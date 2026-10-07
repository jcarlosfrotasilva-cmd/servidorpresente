"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertIcon, ArrowRightIcon } from "@/components/icons";
import { Button } from "@/components/ui";

/** Tela de erro do sistema (evita o erro críptico de Server Components). */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="card w-full max-w-xl p-7">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200">
          <AlertIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-black tracking-tight text-slate-900">
          Não foi possível carregar esta tela
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Ocorreu uma falha ao consultar o sistema. Isso normalmente acontece quando a conexão com o
          banco de dados está indisponível ou o limite de conexões foi atingido. Tente novamente em
          alguns segundos.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12px] text-slate-500 ring-1 ring-inset ring-slate-200">
            Código do erro (informe à direção/TI):{" "}
            <span className="font-mono font-semibold text-slate-700">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Button onClick={reset}>Tentar novamente</Button>
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
          >
            Ir para o início <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-4 text-[11px] text-slate-400">
          Gestor: verifique em Configuração → Banco de dados se a conexão está saudável.
        </p>
      </div>
    </div>
  );
}
