import { Alert, Button, Group, Select, Stack, Text, Textarea } from "@mantine/core";
import { FormModal } from "../../../shared/ui/FormModal";
import { type useFullWaste, wasteReasons, type WasteInput } from "../hooks";
export function FullWasteDialog({ state }: { state: ReturnType<typeof useFullWaste> }) {
  return <FormModal opened={state.snapshot !== null} onClose={state.close} title="全數報廢申請" busy={state.pending}>
    <Stack>
      <Text>{state.snapshot?.ingredient_name} · {state.snapshot?.batch_number}</Text>
      {state.unresolved && <Alert color="yellow">上次報廢結果尚未確認，請先重試同筆操作；原數量與原因會保留。</Alert>}
      <Text>本次核對數量：{state.snapshot?.remaining_quantity} {state.snapshot?.unit}</Text>
      <Text size="sm">送出後待管理員審核，核准前不扣庫存。</Text>
      <Select label="全數報廢原因" data={wasteReasons} value={state.reason} disabled={state.pending || state.unresolved}
        onChange={v => v && state.setReason(v as WasteInput["reason"])} allowDeselect={false} />
      <Textarea label="全數報廢說明" value={state.note} disabled={state.pending || state.unresolved}
        required={state.reason === "OTHER"} onChange={e => state.setNote(e.currentTarget.value)} />
      {state.error.message && <Alert color="red" role="alert">{state.error.message}
        {state.error.remaining != null && <Text>最新剩餘量：{String(state.error.remaining)}。請關閉後重新核對並開啟。</Text>}
        {state.error.fields?.map(f => <Text key={f.field}>{f.message}</Text>)}
      </Alert>}
      <Group><Button color="red" mih={44} loading={state.pending}
        disabled={state.reason === "OTHER" && !state.note.trim()}
        onClick={() => void state.confirm()}>送出全數報廢審核</Button>
        <Button variant="default" mih={44} disabled={state.pending} onClick={state.close}>取消</Button></Group>
    </Stack>
  </FormModal>;
}
