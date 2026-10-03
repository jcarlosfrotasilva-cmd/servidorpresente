import { sql } from "drizzle-orm";
import { db, dbInfo, pool } from "@/db";
import { ApiError, handleRoute, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { dadosDemoAtivos } from "@/lib/seed";

export const dynamic = "force-dynamic";

type Info = {
  versao: string;
  banco: string;
  usuario: string;
  agora: string;
  fuso: string;
};

/**
 * Diagnóstico da conexão com o banco de dados.
 * Útil após trocar a DATABASE_URL (ex.: migração para o Supabase).
 */
export async function GET() {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    let conexao: Info | null = null;
    let erro: string | null = null;

    try {
      const resultado = await db.execute<Info>(sql`
        select
          version() as versao,
          current_database() as banco,
          current_user as usuario,
          now()::text as agora,
          current_setting('TimeZone') as fuso
      `);
      conexao = resultado.rows[0] ?? null;
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao consultar o banco.";
    }

    const tabelas: { tabela: string; linhas: number | null }[] = [];
    let tabelasAusentes = 0;

    if (conexao) {
      const lista = await db.execute<{ table_name: string }>(sql`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name
      `);

      const esperadas = [
        "employees",
        "employee_schedules",
        "work_schedules",
        "users",
        "sessions",
        "time_entries",
        "adjustment_requests",
        "absences",
        "holidays",
        "livro_ponto_fechamentos",
        "audit_logs",
        "settings",
      ];

      const existentes = new Set(lista.rows.map((row) => row.table_name));
      tabelasAusentes = esperadas.filter((nome) => !existentes.has(nome)).length;

      for (const nome of esperadas) {
        if (!existentes.has(nome)) {
          tabelas.push({ tabela: nome, linhas: null });
          continue;
        }
        const total = await db.execute<{ total: number }>(
          sql.raw(`select count(*)::int as total from "${nome}"`),
        );
        tabelas.push({ tabela: nome, linhas: Number(total.rows[0]?.total ?? 0) });
      }
    }

    const horaServidor = new Date();
    const horaBanco = conexao?.agora ? new Date(conexao.agora) : null;
    const diferencaSegundos =
      horaBanco != null ? Math.round((horaBanco.getTime() - horaServidor.getTime()) / 1000) : null;

    const alertas: string[] = [];
    if (erro) alertas.push(`Falha na conexão: ${erro}`);
    if (dbInfo.pooler) {
      alertas.push(
        "Conexão via pooler (Supavisor). O sistema já está configurado com pool reduzido e sem prepared statements nomeados.",
      );
    }
    if (!dbInfo.local && !dbInfo.ssl) {
      alertas.push(
        "Conexão remota sem SSL ativo. No Supabase use sslmode=require ou DATABASE_SSL=true.",
      );
    }
    if (tabelasAusentes > 0) {
      alertas.push(
        `${tabelasAusentes} tabela(s) do sistema não existem neste banco. Execute o SQL de migração antes de usar.`,
      );
    }
    if (!dadosDemoAtivos() && conexao) {
      alertas.push(
        "Modo produção: nenhum dado de demonstração é criado automaticamente (SEED_DEMO desativado).",
      );
    }
    if (diferencaSegundos != null && Math.abs(diferencaSegundos) > 120) {
      alertas.push(
        `Diferença de ${diferencaSegundos}s entre o relógio do banco e do servidor — confira o fuso do banco (recomendado UTC).`,
      );
    }

    return ok({
      info: dbInfo,
      conexao,
      tabelas,
      tabelasAusentes,
      horaServidor: horaServidor.toISOString(),
      diferencaSegundos,
      pool: {
        total: pool.totalCount,
        ociosas: pool.idleCount,
        aguardando: pool.waitingCount,
        max: dbInfo.poolMax,
      },
      demoAtivo: dadosDemoAtivos(),
      alertas,
      erro,
    });
  });
}
