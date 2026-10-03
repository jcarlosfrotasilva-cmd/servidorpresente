import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  absences,
  adjustmentRequests,
  employeeSchedules,
  employees,
  holidays,
  timeEntries,
  users,
  workSchedules,
} from "@/db/schema";
import { getConfiguracao } from "@/lib/config";
import { hashPassword } from "@/lib/password";
import { GESTOR_DEMO, SERVIDOR_DEMO, emailInstitucional } from "@/lib/demo";
import type { DaySchedule } from "@/lib/schedule";
import { addDays, nowLocal, parseTime, minutesToTime, dayOfWeek, type EntryType } from "@/lib/time";

let seedPromise: Promise<void> | null = null;

/** Hosts considerados ambiente local (sandbox/demonstração). */
function bancoLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      ["localhost", "127.0.0.1", "::1", "host.docker.internal", "postgres"].includes(host) ||
      host.endsWith(".local")
    );
  } catch {
    return true;
  }
}

/**
 * Verifica se o ambiente deve receber os dados de demonstração.
 * Em bancos gerenciados (Supabase/Neon) o padrão é NÃO criar dados fictícios;
 * use SEED_DEMO=true quando quiser popular um ambiente de testes.
 */
export function dadosDemoAtivos(): boolean {
  const flag = process.env.SEED_DEMO;
  if (flag != null) return ["1", "true", "sim", "yes", "on"].includes(flag.toLowerCase());
  return bancoLocal(process.env.DATABASE_URL ?? "");
}

/** Cria apenas o usuário de gestão quando o banco está vazio (produção). */
async function criarGestorInicial(): Promise<void> {
  const email = (process.env.GESTOR_EMAIL ?? GESTOR_DEMO.email).toLowerCase();
  const senha = process.env.GESTOR_SENHA ?? GESTOR_DEMO.senha;
  const nome = process.env.GESTOR_NOME ?? GESTOR_DEMO.nome;

  await db.insert(users).values({
    nome,
    email,
    passwordHash: hashPassword(senha),
    role: "GESTOR",
    employeeId: null,
    ativo: true,
  });

  console.log(
    `[seed] banco iniciado em produção: usuário de gestão criado (${email}). ` +
      "Altere a senha em Configuração/Acesso e cadastre os servidores da unidade.",
  );
}

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = bootstrap()
      .catch((error) => {
        console.error("[seed]", error);
        seedPromise = null;
      });
  }
  return seedPromise;
}

async function bootstrap(): Promise<void> {
  const demo = dadosDemoAtivos();

  const [usuarios] = await db.select({ total: sql<number>`count(*)::int` }).from(users);
  if (Number(usuarios?.total ?? 0) === 0) {
    if (demo) {
      await runSeed();
    } else {
      await criarGestorInicial();
    }
  } else if (demo) {
    await runSeed();
  }

  if (demo) await seedCalendar();
  await getConfiguracao();
}

/**
 * Feriados, pontos facultativos e ausências de DEMONSTRAÇÃO (idempotente).
 * Executado apenas em ambiente local ou com SEED_DEMO=true.
 */
async function seedCalendar(): Promise<void> {
  const [feriadosExistentes] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(holidays);

  if (Number(feriadosExistentes?.total ?? 0) === 0) {
    await db.insert(holidays).values([
      { data: "2026-09-07", nome: "Independência do Brasil", tipo: "FERIADO", bloqueiaPonto: true, descricao: "Feriado nacional." },
      { data: "2026-10-12", nome: "Nossa Senhora Aparecida", tipo: "FERIADO", bloqueiaPonto: true, descricao: "Padroeira do Brasil — feriado nacional." },
      { data: "2026-10-15", nome: "Dia do Professor", tipo: "PONTO_FACULTATIVO", bloqueiaPonto: true, descricao: "Data comemorativa — definido ponto facultativo pela direção." },
      { data: "2026-10-28", nome: "Dia do Servidor Público", tipo: "PONTO_FACULTATIVO", bloqueiaPonto: true, descricao: "Ponto facultativo na unidade escolar." },
      { data: "2026-11-02", nome: "Finados", tipo: "FERIADO", bloqueiaPonto: true, descricao: "Feriado nacional." },
      { data: "2026-11-15", nome: "Proclamação da República", tipo: "FERIADO", bloqueiaPonto: true, descricao: "Feriado nacional." },
      { data: "2026-11-20", nome: "Consciência Negra", tipo: "FERIADO", bloqueiaPonto: true, descricao: "Feriado nacional." },
      { data: "2026-12-25", nome: "Natal", tipo: "FERIADO", bloqueiaPonto: true, descricao: "Feriado nacional." },
      { data: "2027-01-01", nome: "Confraternização Universal", tipo: "FERIADO", bloqueiaPonto: true, descricao: "Feriado nacional." },
    ]);
  }

  const [ausenciasExistentes] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(absences);
  if (Number(ausenciasExistentes?.total ?? 0) > 0) return;

  const servidores = await db
    .select({ id: employees.id, nome: employees.nome })
    .from(employees)
    .orderBy(asc(employees.id));
  if (servidores.length === 0) return;

  const porMatricula = new Map<string, number>();
  const lista = await db
    .select({ id: employees.id, matricula: employees.matricula })
    .from(employees);
  lista.forEach((row) => porMatricula.set(row.matricula, row.id));

  const id = (matricula: string) => porMatricula.get(matricula);
  const ferias = id("MFS-11902");
  const orientacao = id("MFS-10319");
  const saude = id("MFS-10234");
  const premio = id("MFS-10022");
  const doenca = id("MFS-10755");
  const parcial = id("MFS-10876");

  const registros = [
    ferias && {
      employeeId: ferias,
      tipo: "FERIAS" as const,
      periodo: "DIA_INTEIRO" as const,
      dataInicio: "2026-10-05",
      dataFim: "2026-10-16",
      motivo: "Férias regulamentares — 10 dias úteis.",
      documento: "Processo SEE 2026/00145",
    },
    orientacao && {
      employeeId: orientacao,
      tipo: "ORIENTACAO_TECNICA" as const,
      periodo: "DIA_INTEIRO" as const,
      dataInicio: "2026-10-08",
      dataFim: "2026-10-08",
      motivo: "Orientação técnica de organização escolar na Diretoria de Ensino.",
      documento: "Ofício DE 2026/078",
    },
    saude && {
      employeeId: saude,
      tipo: "LICENCA_SAUDE" as const,
      periodo: "DIA_INTEIRO" as const,
      dataInicio: "2026-10-06",
      dataFim: "2026-10-07",
      motivo: "Licença saúde homologada por perícia médica.",
      documento: "Atestado nº 4471/2026",
    },
    premio && {
      employeeId: premio,
      tipo: "LICENCA_PREMIO" as const,
      periodo: "DIA_INTEIRO" as const,
      dataInicio: "2026-10-19",
      dataFim: "2026-10-23",
      motivo: "Licença-prêmio referente ao período aquisitivo 2021-2026.",
      documento: "Processo SEE 2026/00211",
    },
    doenca && {
      employeeId: doenca,
      tipo: "DOENCA" as const,
      periodo: "DIA_INTEIRO" as const,
      dataInicio: "2026-10-09",
      dataFim: "2026-10-09",
      motivo: "Afastamento por doença informado pela própria servidora.",
    },
    parcial && {
      employeeId: parcial,
      tipo: "ATESTADO" as const,
      periodo: "PARCIAL" as const,
      dataInicio: "2026-10-13",
      dataFim: "2026-10-13",
      horaInicio: "13:00:00",
      horaFim: "17:00:00",
      motivo: "Consulta e exames médicos no período da tarde.",
      documento: "Atestado nº 5002/2026",
    },
  ].filter(Boolean) as {
    employeeId: number;
    tipo: "FERIAS" | "ORIENTACAO_TECNICA" | "LICENCA_SAUDE" | "LICENCA_PREMIO" | "DOENCA" | "ATESTADO";
    periodo: "DIA_INTEIRO" | "PARCIAL";
    dataInicio: string;
    dataFim: string;
    horaInicio?: string;
    horaFim?: string;
    motivo?: string;
    documento?: string;
  }[];

  if (registros.length > 0) await db.insert(absences).values(registros);
  console.log("[seed] calendário escolar e ausências criados");
}

type WeekSpec = Array<Partial<DaySchedule> & { diaSemana: number }>;

function full(faltas: number[] = []): WeekSpec {
  return [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({
    diaSemana,
    trabalha: diaSemana <= 5 && !faltas.includes(diaSemana),
  }));
}

function buildWeekSpec(
  base: WeekSpec,
  horario: Partial<DaySchedule>,
  dias: number[],
): WeekSpec {
  return base.map((dia) =>
    dias.includes(dia.diaSemana)
      ? {
          ...dia,
          trabalha: true,
          entrada: horario.entrada ?? "07:00:00",
          saidaAlmoco: horario.saidaAlmoco ?? null,
          retornoAlmoco: horario.retornoAlmoco ?? null,
          saidaExpediente: horario.saidaExpediente ?? "17:00:00",
          toleranciaMin: horario.toleranciaMin ?? 10,
        }
      : dia,
  );
}

async function runSeed(): Promise<void> {
  const existing = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from ${users}`,
  );
  const total = Number(existing.rows[0]?.total ?? 0);
  if (total > 0) {
    await backfillSchedules();
    return;
  }

  const jornadas = await db
    .insert(workSchedules)
    .values([
      {
        nome: "Modelo — Docente turno manhã/tarde",
        descricao: "Base para docentes com aula nos dois turnos.",
        entrada: "07:00:00",
        saidaAlmoco: "11:30:00",
        retornoAlmoco: "13:00:00",
        saidaExpediente: "17:00:00",
        cargaDiariaMin: 480,
        toleranciaMin: 10,
        diasSemana: [1, 2, 3, 4, 5],
      },
      {
        nome: "Modelo — Administrativo integral",
        descricao: "Secretaria e apoio administrativo.",
        entrada: "08:00:00",
        saidaAlmoco: "12:00:00",
        retornoAlmoco: "13:00:00",
        saidaExpediente: "17:00:00",
        cargaDiariaMin: 480,
        toleranciaMin: 10,
        diasSemana: [1, 2, 3, 4, 5],
      },
      {
        nome: "Modelo — Apoio escolar manhã",
        descricao: "Jornada de 5 horas sem intervalo.",
        entrada: "07:00:00",
        saidaAlmoco: null,
        retornoAlmoco: null,
        saidaExpediente: "12:00:00",
        cargaDiariaMin: 300,
        toleranciaMin: 10,
        diasSemana: [1, 2, 3, 4, 5],
      },
      {
        nome: "Modelo — Noturno",
        descricao: "Aulas e plantões no período da noite.",
        entrada: "19:00:00",
        saidaAlmoco: null,
        retornoAlmoco: null,
        saidaExpediente: "22:30:00",
        cargaDiariaMin: 210,
        toleranciaMin: 10,
        diasSemana: [2, 3, 4],
      },
    ])
    .returning({ id: workSchedules.id });

  const [docente, administrativo, apoio] = jornadas.map((row) => row.id);

  const anaWeek = buildWeekSpec(
    buildWeekSpec(
      buildWeekSpec(full(), { entrada: "07:00:00", saidaAlmoco: "11:30:00", retornoAlmoco: "13:00:00", saidaExpediente: "17:00:00" }, [1, 2, 4]),
      { entrada: "07:00:00", saidaExpediente: "12:00:00" },
      [3],
    ),
    { entrada: "13:00:00", saidaExpediente: "17:00:00" },
    [5],
  );

  const seedEmployees = [
    { nome: SERVIDOR_DEMO.nome, rg: "12.345.678-9 SSP/SP", categoria: "EFETIVO", email: SERVIDOR_DEMO.email, cargo: "Professora de Matemática", vinculo: "EFETIVO", matricula: "MFS-10234", jornadaId: docente, telefone: "(11) 98812-4410", week: anaWeek },
    { nome: "Carlos Eduardo Lima", rg: "23.456.789-0 SSP/SP", categoria: "EFETIVO", email: emailInstitucional("Carlos Eduardo Lima"), cargo: "Professor de História", vinculo: "EFETIVO", matricula: "MFS-10876", jornadaId: docente, telefone: "(11) 99713-2288",
      week: buildWeekSpec(buildWeekSpec(full([1]), { entrada: "08:00:00", saidaAlmoco: "12:00:00", retornoAlmoco: "13:00:00", saidaExpediente: "17:00:00" }, [2, 3, 4, 5]), { entrada: "19:00:00", saidaExpediente: "22:00:00" }, [6]) },
    { nome: "Fernanda Ribeiro", rg: "34.567.890-1 SSP/SP", categoria: "EFETIVO", email: emailInstitucional("Fernanda Ribeiro"), cargo: "Coordenadora Pedagógica", vinculo: "EFETIVO", matricula: "MFS-10022", jornadaId: null, telefone: "(11) 99612-7781",
      week: buildWeekSpec(full(), { entrada: "09:00:00", saidaAlmoco: "12:30:00", retornoAlmoco: "14:00:00", saidaExpediente: "18:00:00", toleranciaMin: 15 }, [1, 2, 3, 4, 5]) },
    { nome: "João Batista Alves", rg: "45.678.901-2 SSP/SP", categoria: "EFETIVO", email: emailInstitucional("João Batista Alves"), cargo: "Agente de Organização Escolar", vinculo: "EFETIVO", matricula: "MFS-10319", jornadaId: apoio, telefone: "(11) 98233-1104",
      week: buildWeekSpec(buildWeekSpec(full(), { entrada: "07:00:00", saidaExpediente: "12:00:00" }, [1, 3, 5]), { entrada: "13:00:00", saidaExpediente: "17:00:00" }, [2, 4]) },
    { nome: "Mariana Costa", rg: "56.789.012-3 SSP/SP", categoria: "ACT", email: emailInstitucional("Mariana Costa"), cargo: "Agente de Organização Escolar", vinculo: "TEMPORARIO", matricula: "MFS-11488", jornadaId: administrativo, telefone: "(11) 99120-5541",
      week: buildWeekSpec(full(), { entrada: "08:00:00", saidaAlmoco: "12:00:00", retornoAlmoco: "13:00:00", saidaExpediente: "17:00:00" }, [1, 2, 3, 4, 5]) },
    { nome: "Roberto Nunes", rg: "67.890.123-4 SSP/SP", categoria: "EFETIVO", email: emailInstitucional("Roberto Nunes"), cargo: "Professor de Educação Física", vinculo: "EFETIVO", matricula: "MFS-10755", jornadaId: docente, telefone: "(11) 98044-9931",
      week: buildWeekSpec(buildWeekSpec(full(), { entrada: "07:00:00", saidaExpediente: "12:00:00" }, [2, 4]), { entrada: "13:00:00", saidaExpediente: "18:00:00" }, [1, 3, 5]) },
    { nome: "Patrícia Gomes", rg: "78.901.234-5 SSP/SP", categoria: "TERCEIRIZADO", email: emailInstitucional("Patrícia Gomes"), cargo: "Auxiliar de Serviços Escolares", vinculo: "TERCEIRIZADO", matricula: "MFS-11902", jornadaId: apoio, telefone: "(11) 98123-0092",
      week: buildWeekSpec(full(), { entrada: "10:00:00", saidaExpediente: "14:00:00" }, [1, 2, 3, 4, 5]) },
  ];

  const insertedEmployees = await db
    .insert(employees)
    .values(
      seedEmployees.map((item) => ({
        matricula: item.matricula,
        nome: item.nome,
        cpf: null,
        rg: item.rg,
        categoria: item.categoria,
        email: item.email,
        telefone: item.telefone,
        cargo: item.cargo,
        vinculo: item.vinculo,
        jornadaId: item.jornadaId,
        dataAdmissao: "2019-02-04",
        observacoes: null,
        ativo: true,
      })),
    )
    .returning({ id: employees.id, nome: employees.nome, email: employees.email });

  const scheduleRows = insertedEmployees.flatMap((employee, index) => {
    const week = seedEmployees[index]?.week ?? full();
    return week.map((dia) => ({
      employeeId: employee.id,
      diaSemana: dia.diaSemana,
      trabalha: Boolean(dia.trabalha),
      entrada: dia.trabalha ? dia.entrada ?? null : null,
      saidaAlmoco: dia.trabalha ? dia.saidaAlmoco ?? null : null,
      retornoAlmoco: dia.trabalha ? dia.retornoAlmoco ?? null : null,
      saidaExpediente: dia.trabalha ? dia.saidaExpediente ?? null : null,
      toleranciaMin: dia.toleranciaMin ?? 10,
    }));
  });
  await db.insert(employeeSchedules).values(scheduleRows);

  const servidorUsers = insertedEmployees.map((employee, index) => ({
    nome: employee.nome,
    email: employee.email ?? emailInstitucional(employee.nome),
    passwordHash: hashPassword(SERVIDOR_DEMO.senha),
    role: "SERVIDOR" as const,
    employeeId: employee.id,
    ativo: index !== 6,
  }));

  await db.insert(users).values([
    {
      nome: GESTOR_DEMO.nome,
      email: GESTOR_DEMO.email,
      passwordHash: hashPassword(GESTOR_DEMO.senha),
      role: "GESTOR",
      employeeId: null,
      ativo: true,
    },
    ...servidorUsers,
  ]);

  // Histórico dos últimos 35 dias respeitando o horário individual de cada servidor.
  const today = nowLocal().date;
  const weeksByEmployee = new Map<number, Map<number, DaySchedule>>();
  insertedEmployees.forEach((employee, index) => {
    const week = new Map<number, DaySchedule>();
    (seedEmployees[index]?.week ?? []).forEach((dia) =>
      week.set(dia.diaSemana, {
        diaSemana: dia.diaSemana,
        trabalha: Boolean(dia.trabalha),
        entrada: dia.entrada ?? null,
        saidaAlmoco: dia.saidaAlmoco ?? null,
        retornoAlmoco: dia.retornoAlmoco ?? null,
        saidaExpediente: dia.saidaExpediente ?? null,
        toleranciaMin: dia.toleranciaMin ?? 10,
      }),
    );
    weeksByEmployee.set(employee.id, week);
  });

  const rows: {
    employeeId: number;
    data: string;
    tipo: "ENTRADA" | "SAIDA_ALMOCO" | "RETORNO_ALMOCO" | "SAIDA_EXPEDIENTE";
    hora: string;
    origin: "SERVIDOR" | "GESTOR" | "RETIFICACAO";
    observacao: string | null;
  }[] = [];

  let seedValue = 7;
  const rand = () => {
    seedValue = (seedValue * 1103515245 + 12345) % 2147483648;
    return seedValue / 2147483648;
  };
  const jitter = (amount: number) => Math.round((rand() - 0.45) * amount);
  const shift = (base: string | null, delta: number) =>
    minutesToTime((parseTime(base ?? "08:00") ?? 480) + delta);

  const push = (
    employeeId: number,
    data: string,
    tipo: "ENTRADA" | "SAIDA_ALMOCO" | "RETORNO_ALMOCO" | "SAIDA_EXPEDIENTE",
    hora: string,
  ) => {
    rows.push({ employeeId, data, tipo, hora, origin: "SERVIDOR", observacao: null });
  };

  insertedEmployees.forEach((employee, index) => {
    if (index === 6) return; // usuário de demonstração inativo
    const week = weeksByEmployee.get(employee.id);
    if (!week) return;
    const variacao = index % 3;

    for (let offset = 34; offset >= 1; offset -= 1) {
      const data = addDays(today, -offset);
      const dia = week.get(dayOfWeek(data));
      if (!dia || !dia.trabalha || !dia.entrada || !dia.saidaExpediente) continue;
      if (rand() < 0.06) continue; // faltas eventuais

      push(employee.id, data, "ENTRADA", `${shift(dia.entrada, variacao + jitter(20))}:00`);

      if (dia.saidaAlmoco && dia.retornoAlmoco) {
        push(employee.id, data, "SAIDA_ALMOCO", `${shift(dia.saidaAlmoco, jitter(14))}:00`);
        push(employee.id, data, "RETORNO_ALMOCO", `${shift(dia.retornoAlmoco, jitter(16))}:00`);
      }

      if (rand() < 0.05) continue; // gera retificações pendentes
      push(employee.id, data, "SAIDA_EXPEDIENTE", `${shift(dia.saidaExpediente, jitter(22))}:00`);
    }

    // Movimenta o painel do dia corrente.
    const diaHoje = week.get(dayOfWeek(today));
    if (diaHoje?.trabalha && diaHoje.entrada && diaHoje.saidaExpediente && rand() > 0.15) {
      push(employee.id, today, "ENTRADA", `${shift(diaHoje.entrada, variacao + jitter(16))}:00`);
      if (diaHoje.saidaAlmoco && diaHoje.retornoAlmoco) {
        push(employee.id, today, "SAIDA_ALMOCO", `${shift(diaHoje.saidaAlmoco, jitter(12))}:00`);
        push(employee.id, today, "RETORNO_ALMOCO", `${shift(diaHoje.retornoAlmoco, jitter(14))}:00`);
      }
      if (rand() < 0.4) {
        push(employee.id, today, "SAIDA_EXPEDIENTE", `${shift(diaHoje.saidaExpediente, jitter(18))}:00`);
      }
    }
  });

  for (let i = 0; i < rows.length; i += 250) {
    await db.insert(timeEntries).values(rows.slice(i, i + 250));
  }

  const recent = insertedEmployees.slice(0, 3).map((employee, index) => {
    const week = weeksByEmployee.get(employee.id);
    const dia = week?.get(dayOfWeek(addDays(today, -(index + 1))));
    return {
      employeeId: employee.id,
      data: addDays(today, -(index + 1)),
      tipo: "SAIDA_EXPEDIENTE" as const,
      horaSolicitada: shift(dia?.saidaExpediente ?? "17:00", index * 10),
      motivo:
        index === 0
          ? "Atendimento a responsável no portão até 17h40 e esquecimento do registro na saída."
          : index === 1
            ? "Reunião pedagógica extraordinária; a saída não foi registrada no leitor."
            : "Falha de conexão no aplicativo ao registrar a saída do expediente.",
      status: "PENDENTE" as const,
    };
  });

  await db.insert(adjustmentRequests).values(
    recent.map((item) => ({ ...item, requestedByUserId: null })),
  );

  console.log("[seed] dados de demonstração criados");
}

/** Migra servidores antigos (vinculados a um modelo) para o horário individual. */
async function backfillSchedules(): Promise<void> {
  const pendentes = await db
    .select({ id: employees.id, jornadaId: employees.jornadaId })
    .from(employees)
    .leftJoin(employeeSchedules, eq(employeeSchedules.employeeId, employees.id))
    .where(sql`${employeeSchedules.id} is null`)
    .groupBy(employees.id, employees.jornadaId);

  if (pendentes.length === 0) return;

  const modelos = await db.select().from(workSchedules);
  const porId = new Map(modelos.map((modelo) => [modelo.id, modelo]));

  const values = pendentes.flatMap((servidor) => {
    const modelo = servidor.jornadaId ? porId.get(servidor.jornadaId) : undefined;
    return [1, 2, 3, 4, 5, 6, 7].map((dia) => {
      const trabalha = Boolean(modelo && modelo.diasSemana.includes(dia));
      return {
        employeeId: servidor.id,
        diaSemana: dia,
        trabalha,
        entrada: trabalha ? modelo?.entrada ?? null : null,
        saidaAlmoco: trabalha ? modelo?.saidaAlmoco ?? null : null,
        retornoAlmoco: trabalha ? modelo?.retornoAlmoco ?? null : null,
        saidaExpediente: trabalha ? modelo?.saidaExpediente ?? null : null,
        toleranciaMin: modelo?.toleranciaMin ?? 10,
      };
    });
  });

  if (values.length > 0) await db.insert(employeeSchedules).values(values);
  console.log("[seed] horários individuais migrados:", pendentes.length);
}
