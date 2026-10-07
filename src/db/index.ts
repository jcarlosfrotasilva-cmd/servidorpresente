import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL é obrigatória.");
}

/** Remove parâmetros de SSL da URL (o SSL é controlado explicitamente abaixo). */
function urlSemSslParam(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("ssl");
    parsed.searchParams.delete("pgbouncer");
    return parsed.toString();
  } catch {
    return url;
  }
}

function interpretar(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const porta = parsed.port || "5432";
    const banco = parsed.pathname.replace(/^\//, "") || "postgres";
    const usuario = decodeURIComponent(parsed.username || "postgres");
    const hostsLocais = ["localhost", "127.0.0.1", "::1", "host.docker.internal", "postgres"];
    const local = hostsLocais.includes(host) || host.endsWith(".local");
    const pooler = porta === "6543" || host.includes("pooler.supabase.com");
    const supabase = host.includes("supabase");
    return { host, porta, banco, usuario, local, pooler, supabase };
  } catch {
    return {
      host: "desconhecido",
      porta: "5432",
      banco: "desconhecido",
      usuario: "desconhecido",
      local: true,
      pooler: false,
      supabase: false,
    };
  }
}

const info = interpretar(databaseUrl);

/**
 * Ambientes serverless (Vercel, Lambda, Netlify) escalam horizontalmente:
 * cada instância precisa de MUITO poucas conexões no pooler para não esgotar
 * o limite do banco gerenciado.
 */
const serverless = Boolean(
  process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY ||
    process.env.CF_PAGES,
);

const maxPadrao = process.env.DATABASE_POOL_MAX
  ? Number(process.env.DATABASE_POOL_MAX)
  : info.local
    ? 10
    : serverless
      ? 1
      : info.pooler
        ? 3
        : 5;

/**
 * SSL: obrigatório em bancos gerenciados (Supabase, Neon, RDS...).
 * Controlável por DATABASE_SSL / DATABASE_SSL_REJECT_UNAUTHORIZED.
 */
const sslDesejado =
  process.env.DATABASE_SSL === "false"
    ? false
    : process.env.DATABASE_SSL === "true" ||
      !info.local ||
      /sslmode=require/i.test(databaseUrl);

const poolConfig: PoolConfig = {
  connectionString: urlSemSslParam(databaseUrl),
  max: Number.isFinite(maxPadrao) && maxPadrao > 0 ? maxPadrao : 1,
  idleTimeoutMillis: serverless ? 5_000 : 30_000,
  connectionTimeoutMillis: 15_000,
  // Libera a conexão assim que fica ociosa (essencial em funções serverless).
  allowExitOnIdle: serverless,
  application_name: "ponto-eletronico-marlene-frattini",
  ...(sslDesejado
    ? {
        ssl: {
          rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true",
        },
      }
    : {}),
};

export const dbInfo = {
  ...info,
  ssl: sslDesejado,
  serverless,
  driver: "node-postgres (pg)",
  poolMax: Number(poolConfig.max ?? 1),
  urlMascarada: `${info.usuario ? `${info.usuario.split(".")[0]}…` : "—"}@${info.host}:${info.porta}/${info.banco}`,
};

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

/**
 * O pool é reaproveitado entre invocações da mesma instância (inclusive em
 * produção/serverless). Sem esse cache, cada requisição abriria novas conexões
 * e o pooler do Supabase seria esgotado rapidamente.
 */
export const pool = globalForDb.__arenaNextJsPostgresqlPool ?? new Pool(poolConfig);
globalForDb.__arenaNextJsPostgresqlPool = pool;

export const db = drizzle(pool);
