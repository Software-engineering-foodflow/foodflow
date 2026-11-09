import { Alert, Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { useRef, useState } from "react";

import { useCurrentEmployee } from "../../auth/hooks";
import { useReverseReceipt, type Receipt } from "../hooks";

export function ReceiptReversal({ receipt }: { receipt: Receipt }) {
  const employee = useCurrentEmployee();
  const reverse = useReverseReceipt();
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const busy = useRef(false);
  async function submit() {
    if (busy.current) return;
    if (!reason.trim()) { setError("請填寫沖銷原因"); return; }
    busy.current = true; setError("");
    try { await reverse.mutateAsync({ id: receipt.id, reason: reason.trim() }); setOpened(false); setSuccess(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "沖銷未完成"); }
    finally { busy.current = false; }
  }
  return <Stack>
    {success && <Alert color="green" role="status">進貨已整單沖銷</Alert>}
    {receipt.status === "REVERSED" && <Alert title="原沖銷資訊" color="gray">
      <Text>沖銷時間：{receipt.reversed_at ? new Date(receipt.reversed_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "—"}</Text>
      <Text>沖銷人：{receipt.reversed_by_name ?? "—"}</Text><Text style={{ overflowWrap: "anywhere" }}>沖銷原因：{receipt.reversal_reason ?? "—"}</Text>
    </Alert>}
    {employee.data?.role === "ADMIN" && receipt.status === "CONFIRMED" && <Group><Button color="red" variant="outline" mih={44} onClick={() => setOpened(true)}>整單沖銷</Button></Group>}
    <Modal opened={opened} title="確認整單沖銷" centered onClose={() => { if (!busy.current) setOpened(false); }} withCloseButton={!reverse.isPending} closeOnClickOutside={!reverse.isPending} closeOnEscape={!reverse.isPending}>
      <Stack><Text fw={600}>沖銷單據：{receipt.receipt_number}</Text><Text>共 {receipt.items.length} 筆明細：{receipt.items.map((item) => `${item.ingredient_name} ${item.quantity ?? "—"} ${item.unit}`).join("、")}</Text><Text>沖銷會扣回此單全部入庫數量，單據將保留為唯讀。已有領用、報廢或盤點異動的批次須以盤點調整處理。請在沖銷後重建正確單據。</Text>
        <Textarea label="沖銷原因" required maxLength={500} size="md" value={reason} disabled={reverse.isPending} onChange={(e) => setReason(e.currentTarget.value)} />
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end"><Button variant="default" mih={44} disabled={reverse.isPending} onClick={() => setOpened(false)}>取消</Button><Button color="red" mih={44} loading={reverse.isPending} disabled={reverse.isPending} onClick={() => void submit()}>確認沖銷</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
