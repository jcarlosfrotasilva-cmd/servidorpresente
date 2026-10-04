import { sql } from "drizzle-orm";
import { db, dbInfo } from "@/db";

export type BancoStatus = {
  conectado: boolean;
  host: string;
  pooler: boolean;
  ssl: boolean;
  serverless: boolean;
  poolMax: number;
  latenciaMs: number | null;
  erro: string | null;
  ajuda: string | null;
};

const AJUDA_LOCAL =
  "Verifique se o PostgreSQL está em execução e se a DATABASE_URL do .env está correta.";
const AJUDA_REMOTA =
  "Confira a variável DATABASE_URL no painel da Vercel (Settings → Environment Variables), usando a connection string do Session Pooler do Supabase (porta 5432). O host de conexão direta é IPv6-only e falha em serverless.";

/** Testa a conexão com o banco e devolve um diagnóstico curto (sem vazar credenciais). */
export async function probeBanco(): Promise<BancoStatus> {
  const inicio = Date.now();
  try {
    await db.execute(sql`select 1`);
    return {
      conectado: true,
      host: dbInfo.host,
      pooler: dbInfo.pooler,
      ssl: dbInfo.ssl,
      serverless: dbInfo.serverless,
      poolMax: dbInfo.poolMax,
      latenciaMs: Date.now() - inicio,
      erro: null,
      ajuda: null,
    };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "erro desconhecido";
    return {
      conectado: false,
      host: dbInfo.host,
      pooler: dbInfo.pooler,
      ssl: dbInfo.ssl,
      serverless: dbInfo.serverless,
      poolMax: dbInfo.poolMax,
      latenciaMs: null,
      erro: mensagem.slice(0, 300),
      ajuda: dbInfo.local ? AJUDA_LOCAL : AJUDA_REMOTA,
    };
  }
}
