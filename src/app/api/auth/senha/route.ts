import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, handleRoute, ok, readJson, reqString } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/password";
import { destroySession, getCurrentUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) throw new ApiError("Sessão expirada. Entre novamente.", 401);

    const body = await readJson(request);
    const senhaAtual = reqString(body, "senhaAtual", "a senha atual");
    const novaSenha = reqString(body, "novaSenha", "a nova senha", { max: 120 });

    if (novaSenha.length < 8) {
      throw new ApiError("A nova senha deve ter no mínimo 8 caracteres.");
    }

    const found = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
    const user = found[0];
    if (!user || !verifyPassword(senhaAtual, user.passwordHash)) {
      throw new ApiError("Senha atual incorreta.", 400);
    }

    await db
      .update(users)
      .set({ passwordHash: hashPassword(novaSenha) })
      .where(eq(users.id, user.id));

    await logAudit({
      actor: sessionUser,
      action: "ALTERAR_SENHA",
      entity: "users",
      entityId: user.id,
    });

    // Invalidar sessão atual para forçar novo login com a nova senha
    await destroySession();

    return ok({ 
      sucesso: true, 
      mensagem: "Senha alterada com sucesso. Faça login novamente com a nova senha."
    });
  });
}
