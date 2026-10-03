import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { adjustmentRequests, employees, timeEntries } from "@/db/schema";
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
import { getCurrentUser, logAudit } from "@/lib/session";
import { ENTRY_LABELS, ENTRY_ORDER, monthEnd } from "@/lib/time";

export const dynamic = "force-dynamic";

export const STATUS = ["PENDENTE", "APROVADA", "REJEITADA"] as const;

export async function GET(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "todos";
    const mes = url.searchParams.get("mes");
    const employeeParam = url.searchParams.get("employeeId");

    const filters = [];
    if (actor.role === "SERVIDOR") {
      if (!actor.employeeId) throw new ApiError("Usuário sem servidor vinculado.", 400);
      filters.push(eq(adjustmentRequests.employeeId, actor.employeeId));
    } else if (employeeParam && employeeParam !== "todos") {
      filters.push(eq(adjustmentRequests.employeeId, Number(employeeParam)));
    }
    if (status !== "todos") {
      const parsed = reqEnum({ status }, "status", "o status", STATUS);
      if (parsed) filters.push(eq(adjustmentRequests.status, parsed));
    }
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      filters.push(gte(adjustmentRequests.data, `${mes}-01`));
      filters.push(lte(adjustmentRequests.data, monthEnd(mes)));
    }

    const rows = await db
      .select({
        id: adjustmentRequests.id,
        employeeId: adjustmentRequests.employeeId,
        employeeNome: employees.nome,
        matricula: employees.matricula,
        cargo: employees.cargo,
        data: adjustmentRequests.data,
        tipo: adjustmentRequests.tipo,
        horaSolicitada: adjustmentRequests.horaSolicitada,
        motivo: adjustmentRequests.motivo,
        status: adjustmentRequests.status,
        parecer: adjustmentRequests.parecer,
        createdAt: adjustmentRequests.createdAt,
        reviewedAt: adjustmentRequests.reviewedAt,
      })
      .from(adjustmentRequests)
      .innerJoin(employees, eq(adjustmentRequests.employeeId, employees.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(adjustmentRequests.createdAt), asc(adjustmentRequests.data))
      .limit(500);

    const registros = await db
      .select({
        id: timeEntries.id,
        employeeId: timeEntries.employeeId,
        data: timeEntries.data,
        tipo: timeEntries.tipo,
        hora: timeEntries.hora,
        origin: timeEntries.origin,
      })
      .from(timeEntries)
      .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
      .where(
        actor.role === "SERVIDOR" && actor.employeeId
          ? eq(timeEntries.employeeId, actor.employeeId)
          : undefined,
      )
      .orderBy(desc(timeEntries.data))
      .limit(800);

    return ok({ solicitacoes: rows, registros, podeAprovar: actor.role === "GESTOR" });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);

    const body = await readJson(request);
    const data = reqDate(body, "data", "a data do registro");
    const tipo = reqEnum(body, "tipo", "o tipo de marcação", ENTRY_ORDER);
    const horaSolicitada = reqTime(body, "horaSolicitada", "o horário correto");
    const motivo = reqString(body, "motivo", "o motivo da retificação", { max: 800 });

    if (!data || !tipo || !horaSolicitada) {
      throw new ApiError("Preencha data, tipo de marcação e horário.");
    }
    if (motivo.length < 12) {
      throw new ApiError("Descreva o motivo com pelo menos 12 caracteres.");
    }

    let employeeId = actor.employeeId;
    if (actor.role === "GESTOR") {
      employeeId = reqInt(body, "employeeId", "o servidor", { min: 1 });
    }
    if (!employeeId) throw new ApiError("Não foi possível identificar o servidor.", 400);

    const pendente = await db
      .select({ id: adjustmentRequests.id })
      .from(adjustmentRequests)
      .where(
        and(
          eq(adjustmentRequests.employeeId, employeeId),
          eq(adjustmentRequests.data, data),
          eq(adjustmentRequests.tipo, tipo),
          eq(adjustmentRequests.status, "PENDENTE"),
        ),
      )
      .limit(1);
    if (pendente[0]) {
      throw new ApiError(
        "Já existe uma solicitação pendente para esta marcação. Aguarde a análise da gestão.",
      );
    }

    const [created] = await db
      .insert(adjustmentRequests)
      .values({
        employeeId,
        data,
        tipo,
        horaSolicitada,
        motivo,
        status: "PENDENTE",
        requestedByUserId: actor.id,
      })
      .returning();

    await logAudit({
      actor,
      action: "SOLICITAR_RETIFICACAO",
      entity: "adjustment_requests",
      entityId: created.id,
      details: { data, tipo, horaSolicitada },
    });

    return ok(
      {
        solicitacao: created,
        mensagem: `Solicitação de retificação de ${ENTRY_LABELS[tipo]} enviada para análise.`,
      },
      201,
    );
  });
}
