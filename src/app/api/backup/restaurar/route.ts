import { cookies } from "next/headers";
import { ApiError, handleRoute, ok, readJson } from "@/lib/api";
import { restaurarBackup, validarBackup } from "@/lib/backup";
import { contarRegistros, getConfiguracao } from "@/lib/config";
import { SESSION_COOKIE, createSession, getCurrentUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONFIRMACAO = "RESTAURAR";

/**
 * Restauração completa a partir do arquivo JSON de backup.
 * body: { conteudo: <json do arquivo> | string(json), confirmacao: "RESTAURAR", simular?: boolean }
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const body = await readJson(request);
    const bruto = body.conteudo;
    let conteudo: unknown = bruto;

    if (typeof bruto === "string") {
      try {
        conteudo = JSON.parse(bruto);
      } catch {
        throw new ApiError("Não foi possível ler o arquivo de backup (JSON inválido).");
      }
    }
    if (!conteudo) throw new ApiError("Selecione o arquivo de backup.");

    if (body.simular === true) {
      const { resumo } = validarBackup(conteudo);
      const atuais = await contarRegistros();
      return ok({ resumo, atuais, simulado: true });
    }

    const confirmacao = String(body.confirmacao ?? "").trim().toUpperCase();
    if (confirmacao !== CONFIRMACAO) {
      throw new ApiError(
        `Para confirmar a restauração, digite exatamente ${CONFIRMACAO} no campo de confirmação.`,
      );
    }

    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value ?? null;

    const { resumo, inseridos, sessaoMantida } = await restaurarBackup(conteudo, {
      manterSessao: token
        ? { token, userId: actor.id, userAgent: request.headers.get("user-agent") }
        : null,
    });
    const [config, estatisticas] = await Promise.all([getConfiguracao(), contarRegistros()]);

    await logAudit({
      actor,
      action: "RESTAURAR_BACKUP",
      entity: "backup",
      entityId: resumo.geradoEm,
      details: { unidade: resumo.unidade, inseridos },
    });

    // Refaz a sessão do gestor caso o token tenha sido perdido na limpeza.
    if (!sessaoMantida && token) {
      await createSession(actor.id, request.headers.get("user-agent"));
    }

    return ok({
      resumo,
      inseridos,
      config,
      estatisticas,
      sessaoMantida,
      mensagem: `Backup de ${resumo.unidade} restaurado com sucesso.`,
    });
  });
}
