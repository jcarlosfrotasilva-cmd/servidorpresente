import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, employees, sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "ponto_sessao";
const SESSION_HOURS = 12;

export type SessionUser = {
  id: number;
  nome: string;
  email: string;
  role: "GESTOR" | "SERVIDOR";
  employeeId: number | null;
  employeeNome: string | null;
  cargo: string | null;
  matricula: string | null;
  jornadaId: number | null;
};

export async function createSession(userId: number, userAgent?: string | null) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await db.insert(sessions).values({
    token,
    userId,
    userAgent: userAgent?.slice(0, 240) ?? null,
    expiresAt,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
  await db
    .update(users)
    .set({ ultimoAcesso: new Date() })
    .where(eq(users.id, userId));
  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  store.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      nome: users.nome,
      email: users.email,
      role: users.role,
      employeeId: users.employeeId,
      employeeNome: employees.nome,
      cargo: employees.cargo,
      matricula: employees.matricula,
      jornadaId: employees.jornadaId,
      ativo: users.ativo,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || !row.ativo) return null;

  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    role: row.role,
    employeeId: row.employeeId ?? null,
    employeeNome: row.employeeNome ?? null,
    cargo: row.cargo ?? null,
    matricula: row.matricula ?? null,
    jornadaId: row.jornadaId ?? null,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireGestor(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "GESTOR") redirect("/painel");
  return user;
}

export async function requireServidor(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SERVIDOR" || !user.employeeId) redirect(user.role === "GESTOR" ? "/gestor" : "/login");
  return user;
}

export async function logAudit(params: {
  actor: SessionUser | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  details?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: params.actor?.id ?? null,
      actorNome: params.actor?.nome ?? "Sistema",
      action: params.action,
      entity: params.entity,
      entityId: params.entityId != null ? String(params.entityId) : null,
      details: params.details ?? null,
    });
  } catch (error) {
    console.error("[audit]", error);
  }
}
