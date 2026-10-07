"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/client";
import { ENTRY_LABELS, ENTRY_ORDER, formatDateBR, todayISO, type EntryType } from "@/lib/time";

export type RetificacaoAlvo = {
  data: string;
  tipo?: EntryType;
  horaAtual?: string | null;
};

export function RetificacaoModal({
  open,
  onClose,
  alvo,
  onSaved,
  servidores,
}: {
  open: boolean;
  onClose: () => void;
  alvo: RetificacaoAlvo | null;
  onSaved?: () => void;
  servidores?: { id: number; nome: string; matricula: string }[];
}) {
  const toast = useToast();
  const [data, setData] = useState("");
  const [tipo, setTipo] = useState<EntryType>("ENTRADA");
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(alvo?.data ?? todayISO());
    setTipo(alvo?.tipo ?? "ENTRADA");
    setHora(alvo?.horaAtual?.slice(0, 5) ?? "");
    setMotivo("");
    if (servidores && servidores.length > 0) setEmployeeId(String(servidores[0].id));
  }, [open, alvo, servidores]);

  const submit = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        data,
        tipo,
        horaSolicitada: hora,
        motivo,
      };
      if (servidores && servidores.length > 0) {
        payload.employeeId = Number(employeeId);
      }
      await apiFetch("/api/retificacoes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success(
        "Solicitação enviada",
        `A retificação de ${formatDateBR(data)} está aguardando análise da gestão.`,
      );
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error("Não foi possível enviar", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Solicitar retificação de horário"
      description="A alteração só é efetivada após o parecer da gestão escolar."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            loading={saving}
            disabled={!data || !hora || motivo.trim().length < 12 || (!servidores && false)}
          >
            Enviar solicitação
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {servidores && servidores.length > 0 ? (
          <Field label="Servidor">
            <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              {servidores.map((servidor) => (
                <option key={servidor.id} value={servidor.id}>
                  {servidor.nome} · {servidor.matricula}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Data do registro">
            <Input
              type="date"
              value={data}
              onChange={(event) => setData(event.target.value)}
            />
          </Field>
          <Field label="Marcação a corrigir">
            <Select
              value={tipo}
              onChange={(event) => setTipo(event.target.value as EntryType)}
            >
              {ENTRY_ORDER.map((item) => (
                <option key={item} value={item}>
                  {ENTRY_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Horário correto">
            <Input
              type="time"
              value={hora}
              onChange={(event) => setHora(event.target.value)}
            />
          </Field>
        </div>

        {alvo?.horaAtual ? (
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600 ring-1 ring-inset ring-slate-200">
            Horário registrado atualmente:{" "}
            <strong className="font-mono">{alvo.horaAtual.slice(0, 5)}</strong>
          </p>
        ) : null}

        <Field
          label="Justificativa"
          hint="Descreva o ocorrido com detalhes (mínimo de 12 caracteres)."
        >
          <Textarea
            value={motivo}
            maxLength={800}
            placeholder="Ex.: Esqueci de registrar a saída ao atender responsáveis no portão da escola."
            onChange={(event) => setMotivo(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
