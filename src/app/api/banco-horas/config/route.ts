import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bancoHorasConfig } from "@/db/schema";
import { ApiError, handleRoute, ok, readJson, reqBool, reqInt } from "@/lib/api";
import { getCurrentUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito.", 403);

    const config = await db.select().from(bancoHorasConfig).limit(1);
    return ok({ config: config[0] || null });
  });
}

export async function PUT(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito.", 403);

    const body = await readJson(request);
    const validadeMeses = reqInt(body, "validadeMeses", "validade em meses", { min: 1, max: 24 }) ?? 6;
    const limiteUsoDiaMin = reqInt(body, "limiteUsoDiaMin", "limite diário", { min: 15, max: 480 }) ?? 120;
    const limiteUsoMesMin = reqInt(body, "limiteUsoMesMin", "limite mensal", { min: 60, max: 2400 }) ?? 1200;
    const aprovacaoAutomaticaExtra = reqBool(body, "aprovacaoAutomaticaExtra", false);
    const saldoNegativoPermitido = reqBool(body, "saldoNegativoPermitido", true);
    const saldoMinimoNegativoMin = reqInt(body, "saldoMinimoNegativoMin", "saldo mínimo negativo", { min: -4800, max: 0 }) ?? -2400;

    const [config] = await db
      .insert(bancoHorasConfig)
      .values({
        id: 1,
        validadeMeses,
        limiteUsoDiaMin,
        limiteUsoMesMin,
        aprovacaoAutomaticaExtra,
        saldoNegativoPermitido,
        saldoMinimoNegativoMin,
      })
      .onConflictDoUpdate({
        target: bancoHorasConfig.id,
        set: {
          validadeMeses,
          limiteUsoDiaMin,
          limiteUsoMesMin,
          aprovacaoAutomaticaExtra,
          saldoNegativoPermitido,
          saldoMinimoNegativoMin,
          updatedAt: new Date(),
        },
      })
      .returning();

    await logAudit({
      actor,
      action: "CONFIGURAR_BANCO_HORAS",
      entity: "banco_horas_config",
      entityId: 1,
      details: { validadeMeses, limiteUsoDiaMin, limiteUsoMesMin },
    });

    return ok({ config });
  });
}
