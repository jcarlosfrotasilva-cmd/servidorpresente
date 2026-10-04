import { eq } from "drizzle-orm";
import { db } from "@/db";
import { employeeSchedules, employees, workSchedules } from "@/db/schema";
import { ApiError, handleRoute, ok, parseIdParam, readJson, reqInt } from "@/lib/api";
import { buildWeek, parseWeekPayload, weekToList, weekSummary } from "@/lib/schedule";
import { getCurrentUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function readWeek(employeeId: number) {
  const rows = await db
    .select({
      diaSemana: employeeSchedules.diaSemana,
      trabalha: employeeSchedules.trabalha,
      entrada: employeeSchedules.entrada,
      saidaAlmoco: employeeSchedules.saidaAlmoco,
      retornoAlmoco: employeeSchedules.retornoAlmoco,
      saidaExpediente: employeeSchedules.saidaExpediente,
      toleranciaMin: employeeSchedules.toleranciaMin,
    })
    .from(employeeSchedules)
    .where(eq(employeeSchedules.employeeId, employeeId));

  const week = buildWeek(rows);
  return { week, horarios: weekToList(week), resumo: weekSummary(week) };
}

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    const id = parseIdParam((await params).id);
    if (actor.role !== "GESTOR" && actor.employeeId !== id) {
      throw new ApiError("Acesso restrito.", 403);
    }

    const servidor = await db
      .select({ id: employees.id, nome: employees.nome, matricula: employees.matricula })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    if (!servidor[0]) throw new ApiError("Servidor não encontrado.", 404);

    const { horarios, resumo } = await readWeek(id);
    return ok({ servidor: servidor[0], horarios, resumo });
  });
}

/** Substitui integralmente o quadro semanal de horários do servidor. */
export async function PUT(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const body = await readJson(request);
    const servidor = await db
      .select({ id: employees.id, nome: employees.nome })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    if (!servidor[0]) throw new ApiError("Servidor não encontrado.", 404);

    const horarios = parseWeekPayload(body.horarios);

    await db.delete(employeeSchedules).where(eq(employeeSchedules.employeeId, id));
    await db.insert(employeeSchedules).values(
      horarios.map((dia) => ({
        employeeId: id,
        diaSemana: dia.diaSemana,
        trabalha: dia.trabalha,
        entrada: dia.trabalha ? dia.entrada : null,
        saidaAlmoco: dia.trabalha ? dia.saidaAlmoco : null,
        retornoAlmoco: dia.trabalha ? dia.retornoAlmoco : null,
        saidaExpediente: dia.trabalha ? dia.saidaExpediente : null,
        toleranciaMin: dia.toleranciaMin,
      })),
    );

    const { horarios: salvos, resumo } = await readWeek(id);

    await logAudit({
      actor,
      action: "ATUALIZAR_HORARIO_SERVIDOR",
      entity: "employee_schedules",
      entityId: id,
      details: {
        servidor: servidor[0].nome,
        dias: resumo.diasUteis,
        cargaSemanal: resumo.minutos,
        horarios: horarios
          .filter((dia) => dia.trabalha)
          .map((dia) => ({
            dia: dia.diaSemana,
            entrada: dia.entrada,
            saidaAlmoco: dia.saidaAlmoco,
            retornoAlmoco: dia.retornoAlmoco,
            saida: dia.saidaExpediente,
          })),
      },
    });

    return ok({ horarios: salvos, resumo });
  });
}

/** Aplica um modelo de jornada como base do horário individual do servidor. */
export async function POST(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const body = await readJson(request);
    const modeloId = reqInt(body, "modeloId", "o modelo de jornada", { min: 1 });
    if (!modeloId) throw new ApiError("Selecione o modelo de jornada.");

    const [modelo] = await db
      .select()
      .from(workSchedules)
      .where(eq(workSchedules.id, modeloId))
      .limit(1);
    if (!modelo) throw new ApiError("Modelo de jornada não encontrado.", 404);

    const [servidor] = await db
      .select({ id: employees.id, nome: employees.nome })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    if (!servidor) throw new ApiError("Servidor não encontrado.", 404);

    const horarios = [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => {
      const trabalha = modelo.diasSemana.includes(diaSemana);
      return {
        employeeId: id,
        diaSemana,
        trabalha,
        entrada: trabalha ? modelo.entrada : null,
        saidaAlmoco: trabalha ? modelo.saidaAlmoco : null,
        retornoAlmoco: trabalha ? modelo.retornoAlmoco : null,
        saidaExpediente: trabalha ? modelo.saidaExpediente : null,
        toleranciaMin: modelo.toleranciaMin,
      };
    });

    await db.delete(employeeSchedules).where(eq(employeeSchedules.employeeId, id));
    await db.insert(employeeSchedules).values(horarios);

    const { horarios: salvos, resumo } = await readWeek(id);

    await logAudit({
      actor,
      action: "APLICAR_MODELO_HORARIO",
      entity: "employee_schedules",
      entityId: id,
      details: { servidor: servidor.nome, modelo: modelo.nome },
    });

    return ok({ horarios: salvos, resumo, mensagem: `Modelo "${modelo.nome}" aplicado como base.` });
  });
}

