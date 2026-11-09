import { useRef, useState } from "react";
import { Alert, Button, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import { useCreateWaste, wasteErrorInfo, wasteReasons, type WasteBatch, type WasteInput } from "../hooks";
export function WasteForm({ batch, disabled = false }: { batch: WasteBatch; disabled?: boolean }) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<WasteInput["reason"]>("EXPIRED");
  const [note, setNote] = useState("");
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
    try {
      await mutation.mutateAsync({ key, body: { batch_id: batch.id, quantity, reason, note: note || null } });
      setSuccess(true); setQuantity(""); setNote(""); rotate();
    } catch { /* 失敗保留表單及 key。 */ } finally { busy.current = false; }
  }}><Stack>
    <Text>{batch.ingredient_name} · {batch.batch_number} · {batch.location_name}</Text>
    <Text>剩餘量 {batch.remaining_quantity} {batch.unit}；到期日 {batch.expiry_date}</Text>
    <TextInput label="報廢數量" inputMode="decimal" value={quantity} required disabled={disabled || mutation.isPending}
      error={fieldError("quantity")} onChange={e => { setQuantity(e.currentTarget.value); changed(); }} />
    <Select label="報廢原因" data={wasteReasons} value={reason} allowDeselect={false}
      disabled={disabled || mutation.isPending} error={fieldError("reason")}
      onChange={v => { if (v) setReason(v as WasteInput["reason"]); changed(); }} />
    <Textarea label="報廢說明" value={note} required={reason === "OTHER"} disabled={disabled || mutation.isPending}
      error={fieldError("note")} onChange={e => { setNote(e.currentTarget.value); changed(); }} />
    {error.message && <Alert role="alert" color="red">{error.message}
      {error.remaining != null && <Text>最新剩餘量：{String(error.remaining)}，請重新核對數量。</Text>}
    </Alert>}
    {success && <Alert role="status" color="green">報廢已完成</Alert>}
    <Button type="submit" color="red" mih={44} loading={mutation.isPending} disabled={disabled}>登記報廢</Button>
  </Stack></form>;
}
