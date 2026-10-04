import { handleRoute, ok } from "@/lib/api";
import { destroySession, getCurrentUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleRoute(async () => {
    const user = await getCurrentUser();
    await destroySession();
    if (user) {
      await logAudit({ actor: user, action: "LOGOUT", entity: "users", entityId: user.id });
    }
    return ok({ sucesso: true });
  });
}
