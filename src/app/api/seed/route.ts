import { handleRoute, ok } from "@/lib/api";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleRoute(async () => {
    await ensureSeeded();
    return ok({ sucesso: true });
  });
}

export async function GET() {
  return POST();
}
