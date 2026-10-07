import { handleRoute, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    const user = await getCurrentUser();
    return ok({ autenticado: Boolean(user), user });
  });
}
