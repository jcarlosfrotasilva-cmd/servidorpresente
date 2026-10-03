import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-800 to-accent-600 text-sm font-black text-white">
        MF
      </span>
      <h1 className="mt-6 text-3xl font-black tracking-tight text-brand-950">
        Página não encontrada
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        O endereço acessado não existe neste sistema. Utilize o menu do painel ou volte à página
        inicial.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 px-6 text-sm font-semibold text-white shadow-sm transition hover:from-brand-500"
      >
        Voltar ao início <ArrowRightIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}
