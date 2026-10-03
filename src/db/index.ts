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
 * SSL: obrigatório em bancos gerenciados (Supabase, Neon, RDS...).
 * Pode ser desativado com DATABASE_SSL=false e o rigor do certificado pode ser
 * exigido com DATABASE_SSL_REJECT_UNAUTHORIZED=true.
 */
const sslDesejado =
  process.env.DATABASE_SSL === "false"
    ? false
    : process.env.DATABASE_SSL === "true" ||
      !info.local ||
      /sslmode=require/i.test(databaseUrl);

const poolConfig: PoolConfig = {
  connectionString: urlSemSslParam(databaseUrl),
  // O pooler do Supabase (Supavisor) funciona melhor com pools pequenos.
  max: Number(process.env.DATABASE_POOL_MAX ?? (info.pooler ? 5 : 10)),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  ...(sslDesejado
    ? { ssl: { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" } }
    : {}),
};

export const dbInfo = {
  ...info,
  ssl: sslDesejado,
  driver: "node-postgres (pg)",
  poolMax: Number(poolConfig.max ?? 10),
  urlMascarada: `${info.usuario ? `${info.usuario.split(".")[0]}…` : "—"}@${info.host}:${info.porta}/${info.banco}`,
};

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool(poolConfig);

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
