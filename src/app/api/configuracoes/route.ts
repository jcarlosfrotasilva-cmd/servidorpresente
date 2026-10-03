import { ApiError, handleRoute, ok, readJson, reqBool, reqInt, reqString } from "@/lib/api";
import { contarRegistros, getConfiguracao, updateConfiguracao } from "@/lib/config";
import { BRASAO_MAX_BYTES } from "@/lib/livro-ponto-types";
import { getCurrentUser, logAudit } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const [config, estatisticas] = await Promise.all([getConfiguracao(), contarRegistros()]);
    return ok({
      config,
      estatisticas,
      limiteBrasaoBytes: BRASAO_MAX_BYTES,
      podeEditar: true,
    });
  });
}

export async function PUT(request: Request) {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const body = await readJson(request);
    const patch: Record<string, unknown> = {};

    const campos = [
      "governo",
      "secretaria",
      "diretoria",
      "unidade",
      "cie",
      "endereco",
      "municipio",
      "uf",
      "cep",
      "telefone",
      "email",
      "diretorNome",
      "diretorRg",
      "goeNome",
      "secretarioNome",
      "baseLegal",
    ] as const;

    for (const campo of campos) {
      if (body[campo] === undefined) continue;
      patch[campo] = reqString(body, campo, campo, { required: false, max: 400 });
    }

    if (patch.unidade !== undefined && String(patch.unidade).trim().length < 3) {
      throw new ApiError("Informe o nome da unidade escolar.");
    }

    if (body.brasaoDataUrl !== undefined && body.brasaoDataUrl !== null && body.brasaoDataUrl !== "") {
      const dataUrl = String(body.brasaoDataUrl);
      if (!/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(dataUrl)) {
        throw new ApiError("Formato de imagem não aceito. Use PNG, JPG, WEBP ou SVG.");
      }
      if (dataUrl.length > Math.round(BRASAO_MAX_BYTES * 1.4)) {
        throw new ApiError(
          `A imagem do brasão é muito grande (máximo ${Math.round(BRASAO_MAX_BYTES / 1024)} KB).`,
        );
      }
      patch.brasaoDataUrl = dataUrl;
      patch.brasaoNomeArquivo =
        reqString(body, "brasaoNomeArquivo", "o nome do arquivo", {
          required: false,
          max: 160,
        }) || "brasao";
    }

    if (body.brasaoAlturaMm !== undefined) {
      patch.brasaoAlturaMm =
        reqInt(body, "brasaoAlturaMm", "a altura do brasão", { required: false, min: 8, max: 45 }) ??
        20;
    }

    if (body.brasaoNoVerso !== undefined) {
      patch.brasaoNoVerso = reqBool(body, "brasaoNoVerso", true);
    }

    if (body.bloquearForaDoHorario !== undefined) {
      patch.bloquearForaDoHorario = reqBool(body, "bloquearForaDoHorario", true);
    }

    if (body.margemAntesMin !== undefined) {
      patch.margemAntesMin = reqInt(body, "margemAntesMin", "a margem antes da entrada", {
        required: false,
        min: 0,
        max: 240,
      }) ?? 60;
    }

    if (body.margemDepoisMin !== undefined) {
      patch.margemDepoisMin = reqInt(body, "margemDepoisMin", "a margem após a saída", {
        required: false,
        min: 0,
        max: 300,
      }) ?? 120;
    }

    if (Object.keys(patch).length === 0) {
      throw new ApiError("Nenhuma alteração informada.");
    }

    const config = await updateConfiguracao(patch, actor.nome);

    await logAudit({
      actor,
      action: "ATUALIZAR_CONFIGURACAO",
      entity: "settings",
      entityId: 1,
      details: {
        campos: Object.keys(patch),
        unidade: config.unidade,
        brasaoAtualizado: "brasaoDataUrl" in patch,
      },
    });

    return ok({ config });
  });
}

/** Remove a imagem do brasão mantendo os demais dados da escola. */
export async function DELETE() {
  return handleRoute(async () => {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sessão expirada.", 401);
    if (actor.role !== "GESTOR") throw new ApiError("Acesso restrito à gestão.", 403);

    const config = await updateConfiguracao(
      { brasaoDataUrl: null, brasaoNomeArquivo: null },
      actor.nome,
    );

    await logAudit({
      actor,
      action: "REMOVER_BRASAO",
      entity: "settings",
      entityId: 1,
    });

    return ok({ config });
  });
}
