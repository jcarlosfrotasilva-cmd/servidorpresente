CREATE TYPE "public"."absence_period" AS ENUM('DIA_INTEIRO', 'PARCIAL');--> statement-breakpoint
CREATE TYPE "public"."absence_status" AS ENUM('ATIVA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."absence_type" AS ENUM('FERIAS', 'LICENCA_SAUDE', 'LICENCA_PREMIO', 'ORIENTACAO_TECNICA', 'DOENCA', 'ATESTADO', 'FALTA_JUSTIFICADA', 'FOLGA_COMPENSACAO', 'SUSPENSAO', 'OUTROS');--> statement-breakpoint
CREATE TYPE "public"."entry_origin" AS ENUM('SERVIDOR', 'GESTOR', 'RETIFICACAO');--> statement-breakpoint
CREATE TYPE "public"."entry_type" AS ENUM('ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA_EXPEDIENTE');--> statement-breakpoint
CREATE TYPE "public"."holiday_type" AS ENUM('FERIADO', 'PONTO_FACULTATIVO', 'RECESSO', 'SUSPENSAO');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('PENDENTE', 'APROVADA', 'REJEITADA');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('GESTOR', 'SERVIDOR');--> statement-breakpoint
CREATE TABLE "absences" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"tipo" "absence_type" NOT NULL,
	"periodo" "absence_period" DEFAULT 'DIA_INTEIRO' NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"hora_inicio" time,
	"hora_fim" time,
	"motivo" text,
	"documento" text,
	"status" "absence_status" DEFAULT 'ATIVA' NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adjustment_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"data" date NOT NULL,
	"tipo" "entry_type" NOT NULL,
	"hora_solicitada" time NOT NULL,
	"motivo" text NOT NULL,
	"status" "request_status" DEFAULT 'PENDENTE' NOT NULL,
	"requested_by_user_id" integer,
	"reviewed_by_user_id" integer,
	"parecer" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"actor_nome" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"dia_semana" integer NOT NULL,
	"trabalha" boolean DEFAULT false NOT NULL,
	"entrada" time,
	"saida_almoco" time,
	"retorno_almoco" time,
	"saida_expediente" time,
	"tolerancia_min" integer DEFAULT 10 NOT NULL,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"matricula" text NOT NULL,
	"nome" text NOT NULL,
	"cpf" text,
	"rg" text,
	"categoria" text DEFAULT 'EFETIVO' NOT NULL,
	"horario_estudante" boolean DEFAULT false NOT NULL,
	"email" text,
	"telefone" text,
	"cargo" text NOT NULL,
	"vinculo" text DEFAULT 'EFETIVO' NOT NULL,
	"jornada_id" integer,
	"data_admissao" date,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" date NOT NULL,
	"nome" text NOT NULL,
	"tipo" "holiday_type" DEFAULT 'FERIADO' NOT NULL,
	"bloqueia_ponto" boolean DEFAULT true NOT NULL,
	"descricao" text,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "livro_ponto_fechamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"mes" text NOT NULL,
	"protocolo" text NOT NULL,
	"total_minutos" integer DEFAULT 0 NOT NULL,
	"dias_falta" integer DEFAULT 0 NOT NULL,
	"ocorrencias" text,
	"fechado_por_user_id" integer,
	"fechado_por_nome" text,
	"fechado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"governo" text DEFAULT 'GOVERNO DO ESTADO DE SÃO PAULO' NOT NULL,
	"secretaria" text DEFAULT 'SECRETARIA DE ESTADO DA EDUCAÇÃO' NOT NULL,
	"diretoria" text DEFAULT 'DIRETORIA DE ENSINO — REGIÃO DE SÃO PAULO' NOT NULL,
	"unidade" text DEFAULT 'EE PROFA. MARLENE FRATTINI' NOT NULL,
	"cie" text DEFAULT '' NOT NULL,
	"endereco" text DEFAULT '' NOT NULL,
	"municipio" text DEFAULT 'São Paulo' NOT NULL,
	"uf" text DEFAULT 'SP' NOT NULL,
	"cep" text DEFAULT '' NOT NULL,
	"telefone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"diretor_nome" text DEFAULT '' NOT NULL,
	"diretor_rg" text DEFAULT '' NOT NULL,
	"goe_nome" text DEFAULT '' NOT NULL,
	"secretario_nome" text DEFAULT '' NOT NULL,
	"base_legal" text DEFAULT 'Decreto nº 52.054/2007, Instrução UCRH 1/2007 e Comunicado CGRH' NOT NULL,
	"brasao_data_url" text,
	"brasao_nome_arquivo" text,
	"brasao_altura_mm" integer DEFAULT 20 NOT NULL,
	"brasao_no_verso" boolean DEFAULT true NOT NULL,
	"bloquear_fora_do_horario" boolean DEFAULT true NOT NULL,
	"margem_antes_min" integer DEFAULT 60 NOT NULL,
	"margem_depois_min" integer DEFAULT 120 NOT NULL,
	"ultimo_backup_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" text
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"data" date NOT NULL,
	"tipo" "entry_type" NOT NULL,
	"hora" time NOT NULL,
	"origin" "entry_origin" DEFAULT 'SERVIDOR' NOT NULL,
	"observacao" text,
	"ip" text,
	"created_by_user_id" integer,
	"updated_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'SERVIDOR' NOT NULL,
	"employee_id" integer,
	"ativo" boolean DEFAULT true NOT NULL,
	"ultimo_acesso" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"entrada" time NOT NULL,
	"saida_almoco" time,
	"retorno_almoco" time,
	"saida_expediente" time NOT NULL,
	"carga_diaria_min" integer,
	"tolerancia_min" integer DEFAULT 10 NOT NULL,
	"dias_semana" integer[] NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustment_requests" ADD CONSTRAINT "adjustment_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustment_requests" ADD CONSTRAINT "adjustment_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustment_requests" ADD CONSTRAINT "adjustment_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_jornada_id_work_schedules_id_fk" FOREIGN KEY ("jornada_id") REFERENCES "public"."work_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livro_ponto_fechamentos" ADD CONSTRAINT "livro_ponto_fechamentos_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livro_ponto_fechamentos" ADD CONSTRAINT "livro_ponto_fechamentos_fechado_por_user_id_users_id_fk" FOREIGN KEY ("fechado_por_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_schedules_employee_dia_unique" ON "employee_schedules" USING btree ("employee_id","dia_semana");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_matricula_unique" ON "employees" USING btree ("matricula");--> statement-breakpoint
CREATE UNIQUE INDEX "holidays_data_unique" ON "holidays" USING btree ("data");--> statement-breakpoint
CREATE UNIQUE INDEX "livro_ponto_fechamentos_employee_mes_unique" ON "livro_ponto_fechamentos" USING btree ("employee_id","mes");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_employee_data_tipo_unique" ON "time_entries" USING btree ("employee_id","data","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");