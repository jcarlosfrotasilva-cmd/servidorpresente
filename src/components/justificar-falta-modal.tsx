"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { AUSENCIA_TIPOS, type AusenciaTipo } from "@/lib/ausencias";
import { formatDateBR, weekdayLabel, dayOfWeek } from "@/lib/time";

export type JustificativaAlvo = {
  employeeId: number;
  nome: string;
  cargo?: string;
  matricula?: string;
  data: string;
  /** Sugere justificar o dia inteiro (falta total) ou apenas um período (falta parcial). */
  tipoSugerido?: "DIA_INTEIRO" | "PARCIAL";
  faltantes?: string[];
};

const TIPOS_JUSTIFICATIVA: AusenciaTipo[] = [
  "FALTA_JUSTIFICADA",
  "ATESTADO",
  "DOENCA",
  "LICENCA_SAUDE",
  "ORIENTACAO_TECNICA",
  "LICENCA_PREMIO",
  "FERIAS",
  "FOLGA_COMPENSACAO",
  "SUSPENSAO",
  "OUTROS",
];

export function JustificarFaltaModal({
  open,
  onClose,
  alvo,
  onSaved,
  servidores,
}: {
  open: boolean;
  onClose: () => void;
  alvo: JustificativaAlvo | null;
  onSaved?: () => void;
  /** Lista para escolher o servidor (usada no botão de ação geral). */
  servidores?: { employeeId: number; nome: string; cargo: string; matricula: string }[];
}) {
  const toast = useToast();
  const [tipo, setTipo] = useState<AusenciaTipo>("FALTA_JUSTIFICADA");
  const [periodo, setPeriodo] = useState<"DIA_INTEIRO" | "PARCIAL">("DIA_INTEIRO");
  const [data, setData] = useState("");
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [horaFim, setHoraFim] = useState("12:00");
  const [motivo, setMotivo] = useState("");
  const [documento, setDocumento] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [employeeId, setEmployeeId] = useState<number>(0);

  useEffect(() => {
    if (!open || !alvo) return;
    setTipo("FALTA_JUSTIFICADA");
    setPeriodo(alvo.tipoSugerido ?? "DIA_INTEIRO");
    setData(alvo.data);
    setMotivo("");
    setDocumento("");
    setHoraInicio("07:00");
    setHoraFim("12:00");
    const inicial =
      servidores && servidores.length > 0
        ? (servidores.find((item) => item.employeeId === alvo.employeeId)?.employeeId ??
          servidores[0].employeeId)
        : alvo.employeeId;
    setEmployeeId(inicial);
  }, [open, alvo, servidores]);

  const salvar = async () => {
    if (!alvo) return;
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        employeeId: employeeId || alvo.employeeId,
        tipo,
        periodo,
        dataInicio: data,
        dataFim: data,
        motivo,
        documento,
      };
      if (periodo === "PARCIAL") {
        payload.horaInicio = horaInicio;
        payload.horaFim = horaFim;
      }

      await apiFetch("/api/ausencias", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const nomeEscolhido =
        servidores?.find((item) => item.employeeId === employeeId)?.nome ?? alvo.nome;
      toast.success(
        "Falta justificada",
        periodo === "DIA_INTEIRO"
          ? `${nomeEscolhido} · ${formatDateBR(data)} — o dia passa a constar como ausência justificada e deixa de contar como falta.`
          : `${nomeEscolhido} · ${formatDateBR(data)} — ausência parcial de ${horaInicio} às ${horaFim} registrada.`,
      );
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error("Não foi possível justificar", (error as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Justificar falta do servidor"
      description="A justificativa entra no Livro Ponto, nos relatórios e na conferência — e a falta deixa de ser cobrada."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="accent"
            loading={salvando}
            onClick={salvar}
            disabled={!data || (periodo === "PARCIAL" && (!horaInicio || !horaFim))}
          >
            Justificar falta
          </Button>
        </>
      }
    >
      {alvo ? (
        <div className="space-y-4">
          {servidores && servidores.length > 0 ? (
            <Field label="Servidor">
              <Select
                value={String(employeeId)}
                onChange={(event) => setEmployeeId(Number(event.target.value))}
              >
                {servidores.map((item) => (
                  <option key={item.employeeId} value={item.employeeId}>
                    {item.nome} · Mat. {item.matricula}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="rounded-2xl bg-slate-50 px-4 py-3.5 ring-1 ring-inset ring-slate-200">
            <p className="text-[13px] font-bold text-slate-800">
              {servidores?.find((item) => item.employeeId === employeeId)?.nome ?? alvo.nome}
            </p>
            <p className="text-[12px] text-slate-500">
              {alvo.cargo ?? "Servidor"} · Mat. {alvo.matricula ?? "—"}
            </p>
            <p className="mt-1 text-[12px] font-semibold text-brand-700">
              {weekdayLabel(dayOfWeek(alvo.data), true)}, {formatDateBR(alvo.data)}
            </p>
            {alvo.faltantes?.length ? (
              <p className="mt-1.5 text-[11px] text-slate-500">
                Batidas sem registro: {alvo.faltantes.join(", ")}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Motivo da justificativa">
              <Select
                value={tipo}
                onChange={(event) => setTipo(event.target.value as AusenciaTipo)}
              >
                {TIPOS_JUSTIFICATIVA.map((item) => {
                  const meta = AUSENCIA_TIPOS.find((t) => t.value === item);
                  return (
                    <option key={item} value={item}>
                      {meta?.label ?? item}
                    </option>
                  );
                })}
              </Select>
            </Field>
            <Field label="Abrangência da falta">
              <Select
                value={periodo}
                onChange={(event) => setPeriodo(event.target.value as "DIA_INTEIRO" | "PARCIAL")}
              >
                <option value="DIA_INTEIRO">Dia inteiro (falta total)</option>
                <option value="PARCIAL">Parcial — faixa de horário (falta parcial)</option>
              </Select>
            </Field>
            <Field label="Data da falta">
              <Input type="date" value={data} onChange={(event) => setData(event.target.value)} />
            </Field>
            {periodo === "PARCIAL" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Das">
                  <Input
                    type="time"
                    value={horaInicio}
                    onChange={(event) => setHoraInicio(event.target.value)}
                  />
                </Field>
                <Field label="Às">
                  <Input
                    type="time"
                    value={horaFim}
                    onChange={(event) => setHoraFim(event.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <Field label="Documento / protocolo" hint="Processo, ofício ou nº do atestado (opcional).">
                <Input
                  value={documento}
                  onChange={(event) => setDocumento(event.target.value)}
                  placeholder="Ex.: Atestado nº 4471/2026"
                />
              </Field>
            )}
          </div>

          {periodo === "PARCIAL" ? (
            <Field label="Documento / protocolo" hint="Opcional.">
              <Input
                value={documento}
                onChange={(event) => setDocumento(event.target.value)}
                placeholder="Ex.: Atestado nº 4471/2026"
              />
            </Field>
          ) : null}

          <Field
            label="Justificativa"
            hint="Descreva o motivo apresentado pelo servidor (aparece no relatório e no atestado da chefia)."
          >
            <Textarea
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              maxLength={500}
              placeholder="Ex.: Servidor apresentou atestado médico referente ao dia; falta justificada pela direção."
            />
          </Field>

          <p className="rounded-xl bg-brand-50 px-3.5 py-3 text-[12px] leading-relaxed text-brand-900 ring-1 ring-inset ring-brand-100">
            Ao confirmar, o dia passa a constar como <strong>ausência justificada</strong> na
            conferência, no espelho do servidor, nos relatórios e no <strong>verso do Livro
            Ponto</strong> (código <span className="font-mono">FJ</span> para falta justificada,
            <span className="font-mono"> AT</span> para atestado, entre outros). O registro original
            permanece na auditoria.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
