import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { employeeSchedules, employees, timeEntries, users } from "@/db/schema";
import {
  ApiError,
  handleRoute,
  ok,
  parseIdParam,
  readJson,
  reqBool,
  reqDate,
  reqEnum,
  reqInt,
  reqString,
} from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { parseWeekPayload } from "@/lib/schedule";
import { getCurrentUser, logAudit } from "@/lib/session";
import { slugifyEmail } from "@/lib/time";
import { VINCULOS } from "@/app/api/servidores/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    const id = parseIdParam((await params).id);

    if (actor.role !== "GESTOR" && actor.employeeId !== id) {
      throw new ApiError("Acesso restrito.", 403);
    }

    const rows = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
    const servidor = rows[0];
    if (!servidor) throw new ApiError("Servidor não encontrado.", 404);
    return ok({ servidor });
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    const body = await readJson(request);

    const current = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
    const servidor = current[0];
    if (!servidor) throw new ApiError("Servidor não encontrado.", 404);

    const nome = reqString(body, "nome", "o nome completo", { max: 160 });
    const matricula = reqString(body, "matricula", "a matrícula", { max: 40 });
    const cargo = reqString(body, "cargo", "a função/cargo", { max: 120 });
    const vinculo = reqEnum(body, "vinculo", "o vínculo", VINCULOS) ?? servidor.vinculo;
    const cpf = reqString(body, "cpf", "o CPF", { required: false, max: 20 });
    const rg = reqString(body, "rg", "o RG", { required: false, max: 30 });
    const categoria = reqString(body, "categoria", "a categoria funcional", {
      required: false,
      max: 30,
    });
    const telefone = reqString(body, "telefone", "o telefone", { required: false, max: 30 });
    const observacoes = reqString(body, "observacoes", "as observações", {
      required: false,
      max: 600,
    });
    const dataAdmissao = reqDate(body, "dataAdmissao", "a data de admissão", {
      required: false,
    });
    const jornadaId = reqInt(body, "jornadaId", "a jornada de trabalho", {
      required: false,
      min: 1,
    });
    const ativo = reqBool(body, "ativo", servidor.ativo);
    const emailRaw = reqString(body, "email", "o e-mail", { required: false, max: 160 });
    const email = (
      emailRaw || servidor.email || `${slugifyEmail(nome)}@marlenefrattini.sp.gov.br`
    ).toLowerCase();

    const duplicated = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.matricula, matricula))
      .limit(1);
    if (duplicated.length > 0 && duplicated[0].id !== id) {
      throw new ApiError("Outra servidora/servidor já utiliza esta matrícula.");
    }

    const [updated] = await db
      .update(employees)
      .set({
        nome,
        matricula,
        cargo,
        vinculo,
        cpf: cpf || null,
        rg: rg || servidor.rg,
        categoria: categoria || servidor.categoria,
        email,
        telefone: telefone || null,
        observacoes: observacoes || null,
        dataAdmissao: dataAdmissao ?? null,
        jornadaId: jornadaId ?? null,
        ativo,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, id))
      .returning();

    const horarios = body.horarios ? parseWeekPayload(body.horarios) : null;
    if (horarios) {
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
    }

    const linked = await db.select().from(users).where(eq(users.employeeId, id)).limit(1);
    if (linked.length > 0) {
      await db
        .update(users)
        .set({ nome, email, ativo })
        .where(eq(users.id, linked[0].id));
    }

    const novaSenha = reqString(body, "novaSenha", "a nova senha", {
      required: false,
      max: 120,
    });
    if (novaSenha) {
      if (novaSenha.length < 8) throw new ApiError("A nova senha deve ter no mínimo 8 caracteres.");
      if (linked.length === 0) {
        await db.insert(users).values({
          nome,
          email,
          passwordHash: hashPassword(novaSenha),
          role: "SERVIDOR",
          employeeId: id,
          ativo,
        });
      } else {
        await db
          .update(users)
          .set({ passwordHash: hashPassword(novaSenha) })
          .where(eq(users.id, linked[0].id));
      }
    }

    await logAudit({
      actor,
      action: "ATUALIZAR_SERVIDOR",
      entity: "employees",
      entityId: id,
      details: { nome, matricula, ativo, senhaRedefinida: Boolean(novaSenha) },
    });

    return ok({ servidor: updated });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const id = parseIdParam((await params).id);
    if (actor.employeeId === id) {
      throw new ApiError("Não é possível excluir o cadastro vinculado ao seu próprio usuário.");
    }

    const current = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
    const servidor = current[0];
    if (!servidor) throw new ApiError("Servidor não encontrado.", 404);

    const [count] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(eq(timeEntries.employeeId, id));

    await db.delete(users).where(eq(users.employeeId, id));
    await db.delete(employees).where(eq(employees.id, id));

    await logAudit({
      actor,
      action: "EXCLUIR_SERVIDOR",
      entity: "employees",
      entityId: id,
      details: { nome: servidor.nome, matricula: servidor.matricula, registrosExcluidos: count?.total ?? 0 },
    });

    return ok({ sucesso: true, registrosExcluidos: count?.total ?? 0 });
  });
}
