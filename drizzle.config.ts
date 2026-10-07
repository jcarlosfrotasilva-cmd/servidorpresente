import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Configuração do Drizzle para migrações de schema.
 * A URL vem sempre de DATABASE_URL (.env local ou variáveis do ambiente de produção).
 * Exemplo Supabase (pooler de sessão): postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
 */
const url =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

const sslAtivo =
  process.env.DATABASE_SSL === "true" ||
  (!/localhost|127\.0\.0\.1|::1/.test(url) && process.env.DATABASE_SSL !== "false");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: false,
  verbose: true,
  dbCredentials: {
    url,
    ...(sslAtivo
      ? { ssl: { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" } }
      : {}),
  },
});
