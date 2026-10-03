import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["GESTOR", "SERVIDOR"]);

export const entryType = pgEnum("entry_type", [
  "ENTRADA",
  "SAIDA_ALMOCO",
  "RETORNO_ALMOCO",
  "SAIDA_EXPEDIENTE",
]);

/**
 * Horário de trabalho INDIVIDUAL do servidor (fonte da verdade).
 * Pode variar a cada dia da semana — cada linha representa um dia.
 */
export const employeeSchedules = pgTable(
  "employee_schedules",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    /** ISO: 1 = segunda ... 7 = domingo. */
    diaSemana: integer("dia_semana").notNull(),
    trabalha: boolean("trabalha").notNull().default(false),
    entrada: time("entrada"),
    saidaAlmoco: time("saida_almoco"),
    retornoAlmoco: time("retorno_almoco"),
    saidaExpediente: time("saida_expediente"),
    toleranciaMin: integer("tolerancia_min").notNull().default(10),
    observacao: text("observacao"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("employee_schedules_employee_dia_unique").on(
      table.employeeId,
      table.diaSemana,
    ),
  ],
);

export const entryOrigin = pgEnum("entry_origin", [
  "SERVIDOR",
  "GESTOR",
  "RETIFICACAO",
]);

export const requestStatus = pgEnum("request_status", [
  "PENDENTE",
  "APROVADA",
  "REJEITADA",
]);

/** Jornadas / horários de trabalho mantidos pelo gestor. */
export const workSchedules = pgTable("work_schedules", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  entrada: time("entrada").notNull(),
  saidaAlmoco: time("saida_almoco"),
  retornoAlmoco: time("retorno_almoco"),
  saidaExpediente: time("saida_expediente").notNull(),
  cargaDiariaMin: integer("carga_diaria_min"),
  toleranciaMin: integer("tolerancia_min").notNull().default(10),
  diasSemana: integer("dias_semana").array().notNull(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Servidores da escola. */
export const employees = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    matricula: text("matricula").notNull(),
    nome: text("nome").notNull(),
    cpf: text("cpf"),
    rg: text("rg"),
    categoria: text("categoria").notNull().default("EFETIVO"),
    horarioEstudante: boolean("horario_estudante").notNull().default(false),
    email: text("email"),
    telefone: text("telefone"),
    cargo: text("cargo").notNull(),
    vinculo: text("vinculo").notNull().default("EFETIVO"),
    jornadaId: integer("jornada_id").references(() => workSchedules.id, {
      onDelete: "set null",
    }),
    dataAdmissao: date("data_admissao"),
    observacoes: text("observacoes"),
    ativo: boolean("ativo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("employees_matricula_unique").on(table.matricula)],
);

/** Usuários do sistema (gestor e servidores). */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("SERVIDOR"),
    employeeId: integer("employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    ativo: boolean("ativo").notNull().default(true),
    ultimoAcesso: timestamp("ultimo_acesso", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Registros de ponto. */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    data: date("data").notNull(),
    tipo: entryType("tipo").notNull(),
    hora: time("hora").notNull(),
    origin: entryOrigin("origin").notNull().default("SERVIDOR"),
    observacao: text("observacao"),
    ip: text("ip"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("time_entries_employee_data_tipo_unique").on(
      table.employeeId,
      table.data,
      table.tipo,
    ),
  ],
);

/** Solicitações de retificação de ponto. */
export const adjustmentRequests = pgTable("adjustment_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  data: date("data").notNull(),
  tipo: entryType("tipo").notNull(),
  horaSolicitada: time("hora_solicitada").notNull(),
  motivo: text("motivo").notNull(),
  status: requestStatus("status").notNull().default("PENDENTE"),
  requestedByUserId: integer("requested_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  parecer: text("parecer"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Tipos de datas que impactam o calendário escolar. */
export const holidayType = pgEnum("holiday_type", [
  "FERIADO",
  "PONTO_FACULTATIVO",
  "RECESSO",
  "SUSPENSAO",
]);

/** Feriados, pontos facultativos e recessos cadastrados pela gestão. */
export const holidays = pgTable(
  "holidays",
  {
    id: serial("id").primaryKey(),
    data: date("data").notNull(),
    nome: text("nome").notNull(),
    tipo: holidayType("tipo").notNull().default("FERIADO"),
    /** Quando verdadeiro, o servidor não consegue registrar ponto nesta data. */
    bloqueiaPonto: boolean("bloqueia_ponto").notNull().default(true),
    descricao: text("descricao"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("holidays_data_unique").on(table.data)],
);

export const absenceType = pgEnum("absence_type", [
  "FERIAS",
  "LICENCA_SAUDE",
  "LICENCA_PREMIO",
  "ORIENTACAO_TECNICA",
  "DOENCA",
  "ATESTADO",
  "FALTA_JUSTIFICADA",
  "FOLGA_COMPENSACAO",
  "SUSPENSAO",
  "OUTROS",
]);

export const absencePeriod = pgEnum("absence_period", ["DIA_INTEIRO", "PARCIAL"]);

export const absenceStatus = pgEnum("absence_status", ["ATIVA", "CANCELADA"]);

/** Ausências do servidor: totais (dias) ou parciais (faixa de horas). */
export const absences = pgTable("absences", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  tipo: absenceType("tipo").notNull(),
  periodo: absencePeriod("periodo").notNull().default("DIA_INTEIRO"),
  dataInicio: date("data_inicio").notNull(),
  dataFim: date("data_fim").notNull(),
  horaInicio: time("hora_inicio"),
  horaFim: time("hora_fim"),
  motivo: text("motivo"),
  documento: text("documento"),
  status: absenceStatus("status").notNull().default("ATIVA"),
  createdByUserId: integer("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Fechamento mensal do Livro Ponto (atestado da autoridade competente). */
export const livroPontoFechamentos = pgTable(
  "livro_ponto_fechamentos",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    mes: text("mes").notNull(),
    protocolo: text("protocolo").notNull(),
    totalMinutos: integer("total_minutos").notNull().default(0),
    diasFalta: integer("dias_falta").notNull().default(0),
    ocorrencias: text("ocorrencias"),
    fechadoPorUserId: integer("fechado_por_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fechadoPorNome: text("fechado_por_nome"),
    fechadoEm: timestamp("fechado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("livro_ponto_fechamentos_employee_mes_unique").on(
      table.employeeId,
      table.mes,
    ),
  ],
);

/** Configuração institucional do sistema (registro único, id = 1). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  governo: text("governo").notNull().default("GOVERNO DO ESTADO DE SÃO PAULO"),
  secretaria: text("secretaria").notNull().default("SECRETARIA DE ESTADO DA EDUCAÇÃO"),
  diretoria: text("diretoria").notNull().default("DIRETORIA DE ENSINO — REGIÃO DE SÃO PAULO"),
  unidade: text("unidade").notNull().default("EE PROFA. MARLENE FRATTINI"),
  cie: text("cie").notNull().default(""),
  endereco: text("endereco").notNull().default(""),
  municipio: text("municipio").notNull().default("São Paulo"),
  uf: text("uf").notNull().default("SP"),
  cep: text("cep").notNull().default(""),
  telefone: text("telefone").notNull().default(""),
  email: text("email").notNull().default(""),
  diretorNome: text("diretor_nome").notNull().default(""),
  diretorRg: text("diretor_rg").notNull().default(""),
  goeNome: text("goe_nome").notNull().default(""),
  secretarioNome: text("secretario_nome").notNull().default(""),
  baseLegal: text("base_legal")
    .notNull()
    .default(
      "Decreto nº 52.054/2007, Instrução UCRH 1/2007 e Comunicado CGRH",
    ),
  brasaoDataUrl: text("brasao_data_url"),
  brasaoNomeArquivo: text("brasao_nome_arquivo"),
  brasaoAlturaMm: integer("brasao_altura_mm").notNull().default(20),
  brasaoNoVerso: boolean("brasao_no_verso").notNull().default(true),
  /** Bloqueia o registro de ponto fora do dia/horário cadastrado. */
  bloquearForaDoHorario: boolean("bloquear_fora_do_horario").notNull().default(true),
  /** Minutos liberados antes do horário de entrada cadastrado. */
  margemAntesMin: integer("margem_antes_min").notNull().default(60),
  /** Minutos liberados após o horário de saída cadastrado. */
  margemDepoisMin: integer("margem_depois_min").notNull().default(120),
  ultimoBackupEm: timestamp("ultimo_backup_em", { withTimezone: true }),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoPor: text("atualizado_por"),
});

/** Trilha de auditoria das ações administrativas. */
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  actorNome: text("actor_nome"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type EmployeeRow = typeof employees.$inferSelect;
export type EmployeeScheduleRow = typeof employeeSchedules.$inferSelect;
export type LivroPontoFechamentoRow = typeof livroPontoFechamentos.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type WorkScheduleRow = typeof workSchedules.$inferSelect;
export type TimeEntryRow = typeof timeEntries.$inferSelect;
export type AdjustmentRequestRow = typeof adjustmentRequests.$inferSelect;
