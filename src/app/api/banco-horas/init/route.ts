import { db } from "@/db";
import { bancoHorasConfig } from "@/db/schema";
import { ApiError, handleRoute, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito.", 403);

    const [exists] = await db.select().from(bancoHorasConfig).limit(1);
    
    if (!exists) {
      const [config] = await db
        .insert(bancoHorasConfig)
        .values({
          id: 1,
          validadeMeses: 6,
          limiteUsoDiaMin: 120,
          limiteUsoMesMin: 1200,
          aprovacaoAutomaticaExtra: false,
          saldoNegativoPermitido: true,
          saldoMinimoNegativoMin: -2400,
        })
        .returning();
      
      return ok({ config, mensagem: "Configurações inicializadas com sucesso." });
    }
    
    return ok({ config: exists, mensagem: "Configurações já existem." });
  });
}

export async function GET() {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito.", 403);

    const config = await db.select().from(bancoHorasConfig).limit(1);
    return ok({ config: config[0] || null });
  });
}
