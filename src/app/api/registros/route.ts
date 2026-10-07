import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { employees, timeEntries, workSchedules } from "@/db/schema";
import {
  ApiError,
  handleRoute,
  ok,
  readJson,
  reqDate,
  reqEnum,
  reqInt,
  reqString,
  reqTime,
} from "@/lib/api";
import { getConfiguracao } from "@/lib/config";
import { absencesOnDate, buildBlockInfo, loadActiveAbsences, loadHolidayByDate } from "@/lib/calendar";
import { isWorkDay, punchWindow } from "@/lib/schedule";
import { buildEmployeeWeeks } from "@/lib/reports";
import { getCurrentUser, logAudit } from "@/lib/session";
import { ENTRY_ORDER, dayOfWeek, monthEnd, nextExpectedType, nowLocal, parseTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export const TIPOS = ENTRY_ORDER;

export async function GET(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);

    const url = new URL(request.url);
    const escopo = url.searchParams.get("escopo") ?? (actor.role === "GESTOR" ? "todos" : "meus");
    const mes = url.searchParams.get("mes");
    const dataParam = url.searchParams.get("data");
    const tipoParam = url.searchParams.get("tipo");
    const employeeParam = url.searchParams.get("employeeId");
    const limite = Number(url.searchParams.get("limite") ?? 3000);

    const filters = [];
    if (actor.role === "SERVIDOR" || escopo === "meus") {
      if (!actor.employeeId) throw new ApiError("Usuário sem servidor vinculado.", 400);
      filters.push(eq(timeEntries.employeeId, actor.employeeId));
    } else if (employeeParam && employeeParam !== "todos") {
      filters.push(eq(timeEntries.employeeId, Number(employeeParam)));
    }

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      filters.push(gte(timeEntries.data, `${mes}-01`));
      filters.push(lte(timeEntries.data, monthEnd(mes)));
    }
    if (dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam)) {
      filters.push(eq(timeEntries.data, dataParam));
    }
    if (tipoParam && tipoParam !== "todos") {
      const tipo = reqEnum({ tipo: tipoParam }, "tipo", "o tipo", TIPOS);
      if (tipo) filters.push(eq(timeEntries.tipo, tipo));
    }

    const rows = await db
      .select({
        id: timeEntries.id,
        employeeId: timeEntries.employeeId,
        employeeNome: employees.nome,
        matricula: employees.matricula,
        cargo: employees.cargo,
        data: timeEntries.data,
        tipo: timeEntries.tipo,
        hora: timeEntries.hora,
        origin: timeEntries.origin,
        observacao: timeEntries.observacao,
        createdAt: timeEntries.createdAt,
      })
      .from(timeEntries)
      .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(timeEntries.data), asc(timeEntries.hora), asc(timeEntries.tipo))
      .limit(Number.isFinite(limite) ? Math.min(limite, 4000) : 3000);

    const servidores = await db
      .select({
        id: employees.id,
        nome: employees.nome,
        matricula: employees.matricula,
        cargo: employees.cargo,
        jornadaNome: workSchedules.nome,
      })
      .from(employees)
      .leftJoin(workSchedules, eq(employees.jornadaId, workSchedules.id))
      .where(eq(employees.ativo, true))
      .orderBy(asc(employees.nome));

    const hoje = nowLocal().date;
    const registrosHoje = rows.filter((row) => row.data === hoje);
    const proxima = nextExpectedType(registrosHoje.map((row) => row.tipo));

    return ok({ registros: rows, servidores, hoje, proximaEsperada: proxima });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const body = await readJson(request);
    const employeeId = reqInt(body, "employeeId", "o servidor", { min: 1 });
    const data = reqDate(body, "data", "a data");
    const tipo = reqEnum(body, "tipo", "o tipo de marcação", TIPOS);
    const hora = reqTime(body, "hora", "o horário");
    const observacao = reqString(body, "observacao", "a observação", {
      required: false,
      max: 400,
    });
    const forcar = body.forcar === true || body.forcar === "true";

    if (!employeeId || !data || !tipo || !hora) {
      throw new ApiError("Preencha servidor, data, tipo e horário.");
    }

    const [feriado, ausenciasMap] = await Promise.all([
      loadHolidayByDate(data),
      loadActiveAbsences([employeeId], data, data),
    ]);
    const ausenciasDia = absencesOnDate(ausenciasMap.get(employeeId), data);
    const minutos = parseTime(hora) ?? 0;
    const bloqueio = buildBlockInfo({ holiday: feriado, absences: ausenciasDia, minutes: minutos });

    // Regra do dia/horário cadastrado também se aplica ao lançamento manual (com opção de exceção).
    const [config, weeks] = await Promise.all([
      getConfiguracao(),
      buildEmployeeWeeks([employeeId]),
    ]);
    const week = weeks.get(employeeId) ?? new Map();
    const horario = week.get(dayOfWeek(data)) ?? null;
    const janela = punchWindow(horario, config);
    let avisoHorario: string | null = null;

    if (config.bloquearForaDoHorario) {
      if (!isWorkDay(horario)) {
        avisoHorario =
          "Não há expediente cadastrado no horário do servidor para esta data (dia da semana sem jornada).";
      } else if (janela && (minutos < janela.abre || minutos > janela.fecha)) {
        avisoHorario = `Horário fora da janela liberada (${janela.abreLabel} às ${janela.fechaLabel}).`;
      }
      if (avisoHorario && !forcar) {
        throw new ApiError(
          `${avisoHorario} Para lançar mesmo assim, confirme a exceção no formulário.`,
          409,
        );
      }
    }

    if (bloqueio && !forcar) {
      throw new ApiError(
        `${bloqueio.titulo}: ${bloqueio.descricao} Para lançar mesmo assim, confirme a exceção no formulário.`,
        409,
      );
    }

    const servidor = await db
      .select({ id: employees.id, nome: employees.nome })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    if (!servidor[0]) throw new ApiError("Servidor não encontrado.", 404);

    const existing = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, employeeId),
          eq(timeEntries.data, data),
          eq(timeEntries.tipo, tipo),
        ),
      )
      .limit(1);
    if (existing[0]) {
      throw new ApiError(
        "Já existe uma marcação deste tipo nesta data. Utilize a edição do registro existente.",
      );
    }

    const [created] = await db
      .insert(timeEntries)
      .values({
        employeeId,
        data,
        tipo,
        hora,
        origin: "GESTOR",
        observacao:
          observacao ||
          (bloqueio
            ? `Exceção de calendário (${bloqueio.titulo}) — lançamento autorizado pela gestão.`
            : avisoHorario
              ? `Exceção de horário (${avisoHorario}) — lançamento autorizado pela gestão.`
              : "Lançamento realizado pela gestão."),
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      })
      .returning();

    await logAudit({
      actor,
      action: bloqueio || avisoHorario ? "LANCAR_REGISTRO_EXCECAO" : "CRIAR_REGISTRO",
      entity: "time_entries",
      entityId: created.id,
      details: {
        employeeId,
        data,
        tipo,
        hora,
        servidor: servidor[0].nome,
        excecao: bloqueio?.titulo ?? avisoHorario,
      },
    });

    return ok({ registro: created }, 201);
  });
}
