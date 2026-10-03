import { sql } from "drizzle-orm";
import { db, dbInfo } from "@/db";

export const dynamic = "force-dynamic";

/** Verificação de saúde do sistema e da conexão com o banco de dados. */
export async function GET() {
  const inicio = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      banco: {
        conectado: true,
        host: dbInfo.host,
        pooler: dbInfo.pooler,
        ssl: dbInfo.ssl,
        serverless: dbInfo.serverless,
        poolMax: dbInfo.poolMax,
        latenciaMs: Date.now() - inicio,
      },
      hora: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health] falha na conexão com o banco:", error);
    return Response.json(
      {
        ok: false,
        banco: {
          conectado: false,
          host: dbInfo.host,
          pooler: dbInfo.pooler,
          ssl: dbInfo.ssl,
          serverless: dbInfo.serverless,
          poolMax: dbInfo.poolMax,
          erro: error instanceof Error ? error.message : "erro desconhecido",
        },
      },
      { status: 500 },
    );
  }
}
