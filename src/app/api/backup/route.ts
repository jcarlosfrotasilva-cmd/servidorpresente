import { ApiError, handleRoute, ok } from "@/lib/api";
import { gerarBackup } from "@/lib/backup";
import { contarRegistros, getConfiguracao, registrarBackup } from "@/lib/config";
import { getCurrentUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Download do backup completo em JSON. */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const url = new URL(request.url);
    const inspecionar = url.searchParams.get("inspecionar") === "1";

    const backup = await gerarBackup();

    if (inspecionar) {
      const [config, estatisticas] = await Promise.all([getConfiguracao(), contarRegistros()]);
      return ok({
        meta: backup.meta,
        estatisticas,
        ultimoBackupEm: config.ultimoBackupEm,
      });
    }

    await registrarBackup();
    await logAudit({
      actor,
      action: "GERAR_BACKUP",
      entity: "backup",
      entityId: backup.meta.geradoEm,
      details: backup.meta.registros,
    });

    const data = new Date().toISOString().slice(0, 10);
    const nome = `backup-ponto-${backup.meta.unidade.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${data}.json`;

    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
