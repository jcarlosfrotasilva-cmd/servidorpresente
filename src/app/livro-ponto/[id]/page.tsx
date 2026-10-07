import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRightIcon, BookIcon, DownloadIcon } from "@/components/icons";
import { LivroPontoOficial } from "@/components/livro-ponto-oficial";
import { BotaoImprimir } from "@/app/livro-ponto/imprimir-button";
import { getConfiguracao } from "@/lib/config";
import { buildLivroPonto } from "@/lib/livro-ponto";
import { getCurrentUser } from "@/lib/session";
import { currentMonth, monthLabel } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registro de Ponto — SEE/SP" };

export default async function LivroPontoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string; anexo?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { mes: mesParam, anexo } = await searchParams;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) notFound();

  if (user.role === "SERVIDOR" && user.employeeId !== employeeId) redirect("/painel/livro-ponto");

  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : currentMonth();
  
  const [documento, escola] = await Promise.all([
    buildLivroPonto(employeeId, mes),
    getConfiguracao(),
  ]);
  if (!documento) notFound();

  const base = user.role === "GESTOR" ? "/gestor/livro-ponto" : "/painel/livro-ponto";

  return (
    <div className="min-h-screen bg-slate-200 py-0 sm:py-6">
      <div className="no-print mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-brand-700">
            Registro de Ponto — SEE/SP (frente, verso e anexo)
          </p>
          <p className="text-[13px] font-semibold text-slate-700">
            {documento.identificacao.nome} · {monthLabel(mes)}
            {documento.fechamento ? " · competência fechada" : " · competência em aberto"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={base}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
          >
            <ArrowRightIcon className="h-4 w-4" /> Voltar ao sistema
          </Link>

          <BotaoImprimir label="Baixar / imprimir PDF" icon={<DownloadIcon className="h-4 w-4" />} />
        </div>
      </div>

      <div className="print-area space-y-6 px-0 sm:px-6 print:space-y-0">
        <div className="shadow-[var(--shadow-float)] print:shadow-none">
          <LivroPontoOficial
            documento={documento}
            escola={escola}
          />
        </div>
      </div>

      <div className="no-print mx-auto max-w-[1100px] px-4 pb-8 pt-4 sm:px-6">
        <p className="text-center text-[11px] text-slate-500">
          Frente e verso do formulário oficial — um
          documento por servidor. Use “Salvar como PDF” na janela de impressão (layout ajustado para
          folha A4 retrato).
        </p>
        <p className="mx-auto mt-2 max-w-2xl rounded-xl bg-white/70 px-3.5 py-2.5 text-center text-[11px] text-slate-500 ring-1 ring-inset ring-slate-200">
          Para imprimir o brasão oficial da Secretaria no cabeçalho, salve a imagem em{" "}
          <span className="font-mono">public/brasao-sp.png</span> — o sistema passa a usá-la
          automaticamente na frente e no verso.
        </p>
      </div>
    </div>
  );
}
