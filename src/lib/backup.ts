import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  absences,
  adjustmentRequests,
  auditLogs,
  employeeSchedules,
  employees,
  holidays,
  livroPontoFechamentos,
  sessions,
  settings,
  timeEntries,
  users,
  workSchedules,
} from "@/db/schema";
import { ApiError } from "@/lib/api";

export const BACKUP_APP = "ponto-eletronico-ee-profa-marlene-frattini";
export const BACKUP_VERSAO = 1;

type Linhas = Record<string, unknown>[];

export type BackupArquivo = {
  meta: {
    app: string;
    versao: number;
    geradoEm: string;
    unidade: string;
    cie: string;
    fonte: string;
    registros: Record<string, number>;
  };
  dados: {
    configuracao: unknown[];
    jornadasModelo: Linhas;
    servidores: Linhas;
    horarios: Linhas;
    usuarios: Linhas;
    registrosPonto: Linhas;
    retificacoes: Linhas;
    ausencias: Linhas;
    feriados: Linhas;
    fechamentosLivroPonto: Linhas;
    auditoria: Linhas;
  };
};

/** Gera o arquivo completo de backup (JSON) com todas as tabelas do sistema. */
export async function gerarBackup(): Promise<BackupArquivo> {
  const [
    configuracao,
    jornadasModelo,
    servidores,
    horarios,
    usuarios,
    registrosPonto,
    retificacoes,
    listaAusencias,
    listaFeriados,
    fechamentos,
    auditoria,
  ] = await Promise.all([
    db.select().from(settings),
    db.select().from(workSchedules),
    db.select().from(employees),
    db.select().from(employeeSchedules),
    db.select().from(users),
    db.select().from(timeEntries),
    db.select().from(adjustmentRequests),
    db.select().from(absences),
    db.select().from(holidays),
    db.select().from(livroPontoFechamentos),
    db.select().from(auditLogs),
  ]);

  const unidade = configuracao[0]?.unidade ?? "Unidade escolar";

  return {
    meta: {
      app: BACKUP_APP,
      versao: BACKUP_VERSAO,
      geradoEm: new Date().toISOString(),
      unidade,
      cie: configuracao[0]?.cie ?? "",
      fonte: "Sistema de Registro de Ponto Eletrônico",
      registros: {
        jornadasModelo: jornadasModelo.length,
        servidores: servidores.length,
        horarios: horarios.length,
        usuarios: usuarios.length,
        registrosPonto: registrosPonto.length,
        retificacoes: retificacoes.length,
        ausencias: listaAusencias.length,
        feriados: listaFeriados.length,
        fechamentosLivroPonto: fechamentos.length,
        auditoria: auditoria.length,
      },
    },
    dados: {
      configuracao,
      jornadasModelo,
      servidores,
      horarios,
      usuarios,
      registrosPonto,
      retificacoes,
      ausencias: listaAusencias,
      feriados: listaFeriados,
      fechamentosLivroPonto: fechamentos,
      auditoria,
    },
  };
}

export type ResumoRestauracao = {
  versao: number;
  geradoEm: string;
  unidade: string;
  registros: Record<string, number>;
};

/** Valida o arquivo e devolve o resumo (sem gravar nada). */
export function validarBackup(conteudo: unknown): { backup: BackupArquivo; resumo: ResumoRestauracao } {
  if (!conteudo || typeof conteudo !== "object" || Array.isArray(conteudo)) {
    throw new ApiError("Arquivo de backup inválido.");
  }
  const arquivo = conteudo as Partial<BackupArquivo>;
  if (!arquivo.meta || arquivo.meta.app !== BACKUP_APP) {
    throw new ApiError("Este arquivo não é um backup deste sistema de ponto.");
  }
  if (!arquivo.dados || typeof arquivo.dados !== "object") {
    throw new ApiError("O backup não contém dados legíveis.");
  }
  const servidores = arquivo.dados.servidores;
  if (!Array.isArray(servidores) || servidores.length === 0) {
    throw new ApiError("O backup não possui servidores cadastrados. Restauração cancelada.");
  }
  const versao = Number(arquivo.meta.versao ?? 0);
  if (versao > BACKUP_VERSAO) {
    throw new ApiError(
      `Este backup foi gerado por uma versão mais nova (${versao}). Atualize o sistema antes de restaurar.`,
    );
  }
  const registros = Object.fromEntries(
    Object.entries(arquivo.dados).map(([chave, valor]) => [
      chave,
      Array.isArray(valor) ? valor.length : 0,
    ]),
  );

  return {
    backup: arquivo as BackupArquivo,
    resumo: {
      versao,
      geradoEm: String(arquivo.meta.geradoEm ?? ""),
      unidade: String(arquivo.meta.unidade ?? "Unidade não identificada"),
      registros,
    },
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Campos timestamp: no JSON são strings ISO e precisam voltar para Date. */
const CAMPOS_TIMESTAMP = new Set([
  "createdAt",
  "updatedAt",
  "ultimoAcesso",
  "reviewedAt",
  "fechadoEm",
  "atualizadoEm",
  "ultimoBackupEm",
]);

/** Converte chaves em snake_case (dump SQL) para camelCase (esperado pelo Drizzle). */
export function camelizar(chave: string): string {
  if (!chave.includes("_")) return chave;
  return chave.replace(/_([a-z0-9])/g, (_, letra: string) => letra.toUpperCase());
}

function normalizarLinhas(linhas: unknown[]): Record<string, unknown>[] {
  return linhas.map((linha) => {
    if (!linha || typeof linha !== "object") return {};
    const saida: Record<string, unknown> = {};
    for (const [chaveBruta, valor] of Object.entries(linha as Record<string, unknown>)) {
      // Aceita backup gerado pela aplicação (camelCase) ou por dump do banco (snake_case).
      const chave = camelizar(chaveBruta);
      if (
        typeof valor === "string" &&
        CAMPOS_TIMESTAMP.has(chave) &&
        !Number.isNaN(Date.parse(valor))
      ) {
        saida[chave] = new Date(valor);
      } else {
        saida[chave] = valor;
      }
    }
    return saida;
  });
}

async function inserir(tx: Tx, tabela: never, linhas: unknown[]): Promise<number> {
  if (!Array.isArray(linhas) || linhas.length === 0) return 0;
  const normalizadas = normalizarLinhas(linhas);
  const lote = 300;
  let total = 0;
  for (let i = 0; i < normalizadas.length; i += lote) {
    const bloco = normalizadas.slice(i, i + lote) as never[];
    await tx.insert(tabela).values(bloco);
    total += bloco.length;
  }
  return total;
}

async function reiniciarSequencias(tx: Tx): Promise<void> {
  const tabelas = [
    "work_schedules",
    "employees",
    "employee_schedules",
    "users",
    "time_entries",
    "adjustment_requests",
    "absences",
    "holidays",
    "livro_ponto_fechamentos",
    "audit_logs",
  ];
  for (const tabela of tabelas) {
    await tx.execute(
      sql.raw(
        `select setval(pg_get_serial_sequence('${tabela}', 'id'), coalesce((select max(id) from ${tabela}), 1), (select count(*) > 0 from ${tabela}))`,
      ),
    );
  }
}

export async function restaurarBackup(
  conteudo: unknown,
  opcoes?: {
    manterSessao?: { token: string; userId: number; userAgent: string | null } | null;
  },
): Promise<{
  resumo: ResumoRestauracao;
  inseridos: Record<string, number>;
  sessaoMantida: boolean;
}> {
  const { backup, resumo } = validarBackup(conteudo);
  const dados = backup.dados;
  const inseridos: Record<string, number> = {};
  const sessao = opcoes?.manterSessao ?? null;
  let sessaoMantida = false;

  // Tudo em UMA transação: se algo falhar, os dados atuais permanecem intactos.
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from audit_logs`);
    await tx.execute(sql`delete from adjustment_requests`);
    await tx.execute(sql`delete from livro_ponto_fechamentos`);
    await tx.execute(sql`delete from absences`);
    await tx.execute(sql`delete from holidays`);
    await tx.execute(sql`delete from time_entries`);
    await tx.execute(sql`delete from users`);
    await tx.execute(sql`delete from employee_schedules`);
    await tx.execute(sql`delete from employees`);
    await tx.execute(sql`delete from work_schedules`);

    const configuracao = Array.isArray(dados.configuracao) ? dados.configuracao[0] : null;
    if (configuracao) {
      const [registro] = normalizarLinhas([configuracao]);
      await tx
        .insert(settings)
        .values({ ...registro, id: 1 } as never)
        .onConflictDoUpdate({ target: settings.id, set: { ...registro, id: 1 } as never });
      inseridos.configuracao = 1;
    }

    inseridos.jornadasModelo = await inserir(tx, workSchedules as never, dados.jornadasModelo);
    inseridos.servidores = await inserir(tx, employees as never, dados.servidores);
    inseridos.horarios = await inserir(tx, employeeSchedules as never, dados.horarios);
    inseridos.usuarios = await inserir(tx, users as never, dados.usuarios);
    inseridos.registrosPonto = await inserir(tx, timeEntries as never, dados.registrosPonto);
    inseridos.retificacoes = await inserir(tx, adjustmentRequests as never, dados.retificacoes);
    inseridos.ausencias = await inserir(tx, absences as never, dados.ausencias);
    inseridos.feriados = await inserir(tx, holidays as never, dados.feriados);
    inseridos.fechamentosLivroPonto = await inserir(
      tx,
      livroPontoFechamentos as never,
      dados.fechamentosLivroPonto,
    );
    inseridos.auditoria = await inserir(tx, auditLogs as never, dados.auditoria);

    await reiniciarSequencias(tx);

    // A limpeza da tabela "users" remove as sessões por chave estrangeira;
    // recriamos a sessão do gestor que executou a restauração para não perder o acesso.
    if (sessao) {
      const usuarioRestaurado = Array.isArray(dados.usuarios)
        ? dados.usuarios.some((item) => Number((item as { id?: number }).id) === sessao.userId)
        : false;
      if (usuarioRestaurado) {
        await tx
          .insert(sessions)
          .values({
            token: sessao.token,
            userId: sessao.userId,
            userAgent: sessao.userAgent,
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          })
          .onConflictDoNothing();
        sessaoMantida = true;
      }
    }
  });

  return { resumo, inseridos, sessaoMantida };
}
