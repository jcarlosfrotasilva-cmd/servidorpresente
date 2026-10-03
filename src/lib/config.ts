import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { ESCOLA_PADRAO, type EscolaConfig } from "@/lib/livro-ponto-types";

export type ConfiguracaoEscola = EscolaConfig & {
  ultimoBackupEm: Date | null;
  atualizadoEm: Date;
  atualizadoPor: string | null;
};

function toConfig(row: typeof settings.$inferSelect): ConfiguracaoEscola {
  return {
    governo: row.governo,
    secretaria: row.secretaria,
    diretoria: row.diretoria,
    unidade: row.unidade,
    cie: row.cie,
    endereco: row.endereco,
    municipio: row.municipio,
    uf: row.uf,
    cep: row.cep,
    telefone: row.telefone,
    email: row.email,
    diretorNome: row.diretorNome,
    diretorRg: row.diretorRg,
    goeNome: row.goeNome,
    secretarioNome: row.secretarioNome,
    baseLegal: row.baseLegal,
    brasaoDataUrl: row.brasaoDataUrl,
    brasaoNomeArquivo: row.brasaoNomeArquivo,
    brasaoAlturaMm: row.brasaoAlturaMm,
    brasaoNoVerso: row.brasaoNoVerso,
    bloquearForaDoHorario: row.bloquearForaDoHorario,
    margemAntesMin: row.margemAntesMin,
    margemDepoisMin: row.margemDepoisMin,
    ultimoBackupEm: row.ultimoBackupEm,
    atualizadoEm: row.atualizadoEm,
    atualizadoPor: row.atualizadoPor,
  };
}

/** Lê (ou cria) a configuração institucional única do sistema. */
export async function getConfiguracao(): Promise<ConfiguracaoEscola> {
  const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (rows[0]) return toConfig(rows[0]);

  const [created] = await db
    .insert(settings)
    .values({
      id: 1,
      governo: ESCOLA_PADRAO.governo,
      secretaria: ESCOLA_PADRAO.secretaria,
      diretoria: ESCOLA_PADRAO.diretoria,
      unidade: ESCOLA_PADRAO.unidade,
      cie: ESCOLA_PADRAO.cie,
      endereco: ESCOLA_PADRAO.endereco,
      municipio: ESCOLA_PADRAO.municipio,
      uf: ESCOLA_PADRAO.uf,
      cep: ESCOLA_PADRAO.cep,
      telefone: ESCOLA_PADRAO.telefone,
      email: ESCOLA_PADRAO.email,
      diretorNome: ESCOLA_PADRAO.diretorNome,
      baseLegal: ESCOLA_PADRAO.baseLegal,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return toConfig(created);
  const fallback = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return toConfig(fallback[0]);
}

export async function updateConfiguracao(
  patch: Partial<ConfiguracaoEscola>,
  autor: string,
): Promise<ConfiguracaoEscola> {
  await getConfiguracao();
  const [updated] = await db
    .update(settings)
    .set({
      ...patch,
      atualizadoEm: new Date(),
      atualizadoPor: autor,
    })
    .where(eq(settings.id, 1))
    .returning();
  return toConfig(updated);
}

export async function registrarBackup(): Promise<void> {
  await getConfiguracao();
  await db.update(settings).set({ ultimoBackupEm: new Date() }).where(eq(settings.id, 1));
}

export async function contarRegistros(): Promise<Record<string, number>> {
  const resultado = await db.execute<{
    funcionarios: number;
    horarios: number;
    usuarios: number;
    registros: number;
    retificacoes: number;
    ausencias: number;
    feriados: number;
    fechamentos: number;
    auditoria: number;
  }>(sql`
    select
      (select count(*)::int from employees) as funcionarios,
      (select count(*)::int from employee_schedules) as horarios,
      (select count(*)::int from users) as usuarios,
      (select count(*)::int from time_entries) as registros,
      (select count(*)::int from adjustment_requests) as retificacoes,
      (select count(*)::int from absences) as ausencias,
      (select count(*)::int from holidays) as feriados,
      (select count(*)::int from livro_ponto_fechamentos) as fechamentos,
      (select count(*)::int from audit_logs) as auditoria
  `);

  const row = resultado.rows[0];
  return {
    funcionarios: Number(row?.funcionarios ?? 0),
    horarios: Number(row?.horarios ?? 0),
    usuarios: Number(row?.usuarios ?? 0),
    registros: Number(row?.registros ?? 0),
    retificacoes: Number(row?.retificacoes ?? 0),
    ausencias: Number(row?.ausencias ?? 0),
    feriados: Number(row?.feriados ?? 0),
    fechamentos: Number(row?.fechamentos ?? 0),
    auditoria: Number(row?.auditoria ?? 0),
  };
}
