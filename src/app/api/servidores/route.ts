import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { employeeSchedules, employees, users, workSchedules } from "@/db/schema";
import {
  ApiError,
  handleRoute,
  ok,
  readJson,
  reqBool,
  reqDate,
  reqEnum,
  reqInt,
  reqString,
} from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { buildWeek, parseWeekPayload, weekSummary, weekToList } from "@/lib/schedule";
import { getCurrentUser, logAudit } from "@/lib/session";
import { slugifyEmail } from "@/lib/time";

export const dynamic = "force-dynamic";

export const VINCULOS = ["EFETIVO", "TEMPORARIO", "TERCEIRIZADO", "ESTAGIARIO"] as const;

export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await getCurrentUser();
    if (!user) throw new ApiError("Sessão expirada.", 401);
    if (user.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const url = new URL(request.url);
    const busca = (url.searchParams.get("busca") ?? "").trim();
    const status = url.searchParams.get("status") ?? "todos";

    const filters = [];
    if (busca) {
      filters.push(
        or(
          ilike(employees.nome, `%${busca}%`),
          ilike(employees.matricula, `%${busca}%`),
          ilike(employees.cargo, `%${busca}%`),
          ilike(employees.email, `%${busca}%`),
        ),
      );
    }
    if (status === "ativos") filters.push(eq(employees.ativo, true));
    if (status === "inativos") filters.push(eq(employees.ativo, false));

    const rows = await db
      .select({
        id: employees.id,
        matricula: employees.matricula,
        nome: employees.nome,
        cpf: employees.cpf,
        rg: employees.rg,
        categoria: employees.categoria,
        email: employees.email,
        telefone: employees.telefone,
        cargo: employees.cargo,
        vinculo: employees.vinculo,
        jornadaId: employees.jornadaId,
        jornadaNome: workSchedules.nome,
        dataAdmissao: employees.dataAdmissao,
        observacoes: employees.observacoes,
        ativo: employees.ativo,
        usuarioId: users.id,
        usuarioAtivo: users.ativo,
        usuarioEmail: users.email,
      })
      .from(employees)
      .leftJoin(workSchedules, eq(employees.jornadaId, workSchedules.id))
      .leftJoin(users, eq(users.employeeId, employees.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(employees.nome));

    const ids = rows.map((row) => row.id);
    const horariosRows = ids.length
      ? await db
          .select({
            employeeId: employeeSchedules.employeeId,
            diaSemana: employeeSchedules.diaSemana,
            trabalha: employeeSchedules.trabalha,
            entrada: employeeSchedules.entrada,
            saidaAlmoco: employeeSchedules.saidaAlmoco,
            retornoAlmoco: employeeSchedules.retornoAlmoco,
            saidaExpediente: employeeSchedules.saidaExpediente,
            toleranciaMin: employeeSchedules.toleranciaMin,
          })
          .from(employeeSchedules)
          .where(inArray(employeeSchedules.employeeId, ids))
      : [];

    const porServidor = new Map<number, typeof horariosRows>();
    for (const horario of horariosRows) {
      const lista = porServidor.get(horario.employeeId);
      if (lista) lista.push(horario);
      else porServidor.set(horario.employeeId, [horario]);
    }

    const servidores = rows.map((row) => {
      const week = buildWeek(porServidor.get(row.id) ?? []);
      const resumo = weekSummary(week);
      return {
        ...row,
        horarios: weekToList(week),
        diasTrabalho: resumo.diasUteis,
        cargaSemanalMin: resumo.minutos,
      };
    });

    return ok({ servidores });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const body = await readJson(request);
    const nome = reqString(body, "nome", "o nome completo", { max: 160 });
    const matricula = reqString(body, "matricula", "a matrícula", { max: 40 });
    const cargo = reqString(body, "cargo", "a função/cargo", { max: 120 });
    const vinculo =
      reqEnum(body, "vinculo", "o vínculo", VINCULOS, { required: false }) ?? "EFETIVO";
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
    const ativo = reqBool(body, "ativo", true);
    const emailInformado = reqString(body, "email", "o e-mail", { required: false, max: 160 });
    const email = (emailInformado || `${slugifyEmail(nome)}@marlenefrattini.sp.gov.br`).toLowerCase();
    const senhaAcesso = reqString(body, "senhaAcesso", "a senha de acesso", {
      required: false,
      max: 120,
    });
    const criarAcesso = reqBool(body, "criarAcesso", true);

    const existing = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.matricula, matricula))
      .limit(1);
    if (existing.length > 0) {
      throw new ApiError("Já existe um servidor cadastrado com esta matrícula.");
    }

    if (criarAcesso) {
      const emailTaken = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (emailTaken.length > 0) {
        throw new ApiError("Este e-mail já está em uso por outro usuário do sistema.");
      }
      if (!senhaAcesso || senhaAcesso.length < 8) {
        throw new ApiError("Informe uma senha de acesso com no mínimo 8 caracteres.");
      }
    }

    const [novo] = await db
      .insert(employees)
      .values({
        nome,
        matricula,
        cpf: cpf || null,
        rg: rg || null,
        categoria: categoria || "EFETIVO",
        email,
        telefone: telefone || null,
        cargo,
        vinculo,
        jornadaId: jornadaId ?? null,
        dataAdmissao: dataAdmissao ?? null,
        observacoes: observacoes || null,
        ativo,
      })
      .returning();

    const horarios = body.horarios ? parseWeekPayload(body.horarios) : null;
    if (horarios) {
      await db.insert(employeeSchedules).values(
        horarios.map((dia) => ({
          employeeId: novo.id,
          diaSemana: dia.diaSemana,
          trabalha: dia.trabalha,
          entrada: dia.trabalha ? dia.entrada : null,
          saidaAlmoco: dia.trabalha ? dia.saidaAlmoco : null,
          retornoAlmoco: dia.trabalha ? dia.retornoAlmoco : null,
          saidaExpediente: dia.trabalha ? dia.saidaExpediente : null,
          toleranciaMin: dia.toleranciaMin,
        })),
      );
    } else if (jornadaId) {
      const [modelo] = await db
        .select()
        .from(workSchedules)
        .where(eq(workSchedules.id, jornadaId))
        .limit(1);
      if (modelo) {
        await db.insert(employeeSchedules).values(
          [1, 2, 3, 4, 5, 6, 7].map((dia) => {
            const trabalha = modelo.diasSemana.includes(dia);
            return {
              employeeId: novo.id,
              diaSemana: dia,
              trabalha,
              entrada: trabalha ? modelo.entrada : null,
              saidaAlmoco: trabalha ? modelo.saidaAlmoco : null,
              retornoAlmoco: trabalha ? modelo.retornoAlmoco : null,
              saidaExpediente: trabalha ? modelo.saidaExpediente : null,
              toleranciaMin: modelo.toleranciaMin,
            };
          }),
        );
      }
    }

    if (criarAcesso) {
      await db.insert(users).values({
        nome,
        email,
        passwordHash: hashPassword(senhaAcesso),
        role: "SERVIDOR",
        employeeId: novo.id,
        ativo,
      });
    }

    await logAudit({
      actor,
      action: "CRIAR_SERVIDOR",
      entity: "employees",
      entityId: novo.id,
      details: { nome, matricula, cargo, criarAcesso },
    });

    return ok({ servidor: novo }, 201);
  });
}
