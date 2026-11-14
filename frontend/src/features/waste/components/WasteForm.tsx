import { useRef, useState } from "react";
import { Alert, Button, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import { useCreateWaste, wasteErrorInfo, wasteReasons, type WasteBatch, type WasteInput } from "../hooks";
export type UnresolvedWaste = { batch: WasteBatch; body: WasteInput; key: string };
export function WasteForm({ batch, disabled = false, onSuccess, retry, onUnresolved }: {
  batch: WasteBatch; disabled?: boolean; onSuccess?: () => void;
  retry?: UnresolvedWaste | null; onUnresolved?: (value: UnresolvedWaste | null) => void;
}) {
  const [quantity, setQuantity] = useState(retry?.body.quantity ?? "");
  const [reason, setReason] = useState<WasteInput["reason"]>(retry?.body.reason ?? "EXPIRED");
  const [note, setNote] = useState(retry?.body.note ?? "");
  const [unresolved, setUnresolved] = useState<UnresolvedWaste | null>(retry ?? null);
  const [success, setSuccess] = useState(false);
  const { key, rotate } = useIdempotencyKey();
  const mutation = useCreateWaste();
  const busy = useRef(false);
  const error = wasteErrorInfo(mutation.error);
  const changed = () => { rotate(); setSuccess(false); mutation.reset(); };
  const fieldError = (name: string) => error.fields?.find(f => f.field === name)?.message;
  return <form onSubmit={async e => {
    e.preventDefault(); if (busy.current || disabled) return;
    busy.current = true; setSuccess(false);
    const submission = unresolved ?? { batch, key, body: { batch_id: batch.id, quantity, reason, note: note || null } };
    try {
      await mutation.mutateAsync(submission);
      setUnresolved(null); onUnresolved?.(null);
      setSuccess(true); setQuantity(""); setNote(""); rotate();
      onSuccess?.();
    } catch (error) {
      const status = error instanceof Error ? wasteErrorInfo(error).status : undefined;
      const next = status !== undefined && status >= 400 && status < 500 ? null : submission;
      setUnresolved(next); onUnresolved?.(next);
    } finally { busy.current = false; }
  }}><Stack>
    <Text>{batch.ingredient_name} · {batch.batch_number} · {batch.location_name}</Text>
    <Text>剩餘量 {batch.remaining_quantity} {batch.unit}；到期日 {batch.expiry_date}</Text>
    <Text size="sm" c="dimmed">送出後待管理員審核；核准前不扣庫存。</Text>
    {unresolved && <Alert color="yellow">上次報廢結果尚未確認，請先重試同筆操作；原數量與原因會保留。</Alert>}
    <TextInput label="報廢數量" inputMode="decimal" value={quantity} required disabled={disabled || mutation.isPending || Boolean(unresolved)}
      error={fieldError("quantity")} onChange={e => { setQuantity(e.currentTarget.value); changed(); }} />
    <Select label="報廢原因" data={wasteReasons} value={reason} allowDeselect={false}
      disabled={disabled || mutation.isPending || Boolean(unresolved)} error={fieldError("reason")}
      onChange={v => { if (v) setReason(v as WasteInput["reason"]); changed(); }} />
    <Textarea label="報廢說明" value={note} required={reason === "OTHER"} disabled={disabled || mutation.isPending || Boolean(unresolved)}
      error={fieldError("note")} onChange={e => { setNote(e.currentTarget.value); changed(); }} />
    {error.message && <Alert role="alert" color="red">{error.message}
      {error.remaining != null && <Text>最新剩餘量：{String(error.remaining)}，請重新核對數量。</Text>}
    </Alert>}
    {success && <Alert role="status" color="green">報廢申請已送出，待審核</Alert>}
    <Button type="submit" mih={44} loading={mutation.isPending} disabled={disabled}>送出審核</Button>
  </Stack></form>;
}
