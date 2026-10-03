import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowRightIcon, BookIcon, DownloadIcon } from "@/components/icons";
import { LivroPontoOficial } from "@/components/livro-ponto-oficial";
import { BotaoImprimir } from "@/app/livro-ponto/imprimir-button";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { getConfiguracao } from "@/lib/config";
import { buildLivroPonto } from "@/lib/livro-ponto";
import { getCurrentUser } from "@/lib/session";
import { currentMonth, monthLabel } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registro de Ponto da unidade" };

export default async function LivroPontoUnidadePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; anexo?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "GESTOR") redirect("/painel/livro-ponto");

  const { mes: mesParam, anexo } = await searchParams;
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : currentMonth();
  const incluirAnexo = anexo === "1";

  const servidores = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.ativo, true))
    .orderBy(asc(employees.nome));

  const [documentos, escola] = await Promise.all([
    Promise.all(servidores.map((servidor) => buildLivroPonto(servidor.id, mes))).then((lista) =>
      lista.filter((item): item is NonNullable<typeof item> => Boolean(item)),
    ),
    getConfiguracao(),
  ]);

  return (
    <div className="min-h-screen bg-slate-200 py-0 sm:py-6">
      <div className="no-print mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-brand-700">
            Registro de Ponto da unidade — {monthLabel(mes)}
          </p>
          <p className="text-[13px] font-semibold text-slate-700">
            {documentos.length} servidor(es) · frente e verso do formulário oficial
            {incluirAnexo ? " + anexo" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/gestor/livro-ponto"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
          >
            <ArrowRightIcon className="h-4 w-4" /> Voltar
          </Link>
          <Link
            href={`/livro-ponto/unidade?mes=${mes}&anexo=${incluirAnexo ? "0" : "1"}`}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
          >
            <BookIcon className="h-4 w-4" />
            {incluirAnexo ? "Ocultar anexos" : "Incluir anexos"}
          </Link>
          <BotaoImprimir label="Imprimir todos" icon={<DownloadIcon className="h-4 w-4" />} />
        </div>
      </div>

      <div className="print-area space-y-6 px-0 sm:px-6 print:space-y-0">
        {documentos.map((documento, index) => (
          <div
            key={documento.protocolo}
            className="shadow-[var(--shadow-float)] print:shadow-none"
          >
            <LivroPontoOficial
              documento={documento}
              incluirAnexo={incluirAnexo}
              ultimaSemQuebra={index === documentos.length - 1 && !incluirAnexo}
              escola={escola}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
