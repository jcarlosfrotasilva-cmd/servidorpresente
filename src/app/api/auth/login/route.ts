import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, handleRoute, ok, readJson, reqString } from "@/lib/api";
import { verifyPassword } from "@/lib/password";
import { createSession, logAudit } from "@/lib/session";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleRoute(async () => {
    await ensureSeeded();
    const body = await readJson(request);
    const email = reqString(body, "email", "o e-mail").toLowerCase();
    const senha = reqString(body, "senha", "a senha");

    const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = found[0];
    if (!user || !verifyPassword(senha, user.passwordHash)) {
      throw new ApiError("E-mail ou senha incorretos.", 401);
    }
    if (!user.ativo) {
      throw new ApiError(
        "Acesso desativado. Procure a direção da escola para reativar seu usuário.",
        403,
      );
    }

    await createSession(user.id, request.headers.get("user-agent"));
    await logAudit({
      actor: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        employeeNome: null,
        cargo: null,
        matricula: null,
        jornadaId: null,
      },
      action: "LOGIN",
      entity: "users",
      entityId: user.id,
    });

    return ok({ role: user.role, nome: user.nome });
  });
}
