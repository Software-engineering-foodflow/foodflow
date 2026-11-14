import { formatDateTime } from "../../../shared/formatDateTime";
import { useRef, useState } from "react";
import { useSearchParams, Link } from "react-router";
import { Alert, Badge, Button, Group, Loader, Pagination, Paper, Stack, Text, Textarea, Title } from "@mantine/core";
import { FormModal } from "../../../shared/ui/FormModal";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { SearchInput } from "../../../shared/ui/Toolbar";
import { ClipboardIcon, TrashIcon } from "../../../shared/ui/icons";
import { routes } from "../../../shared/routes";
import { useCurrentEmployee } from "../../auth/hooks";
import { useWasteBatches, useWasteBatch, useWasteRecords, useWasteRequests, useReviewWaste, useFullWaste,
  useWastePending, wasteErrorInfo, reasonLabel, type WasteRequest } from "../hooks";
import { WasteForm, type UnresolvedWaste } from "../components/WasteForm";
import { FullWasteDialog } from "../components/FullWasteDialog";

const statuses = { PENDING: "待審核", APPROVED: "已核准", REJECTED: "已駁回" };
export function WasteRecordsPage() {
  const [params, setParams] = useSearchParams();
  const rawId = params.get("batch_id");
  const [retry, setRetry] = useState<UnresolvedWaste | null>(null);
  const id = retry?.batch.id ?? (rawId && /^[1-9][0-9]*$/.test(rawId) ? Number(rawId) : null);
  const [opened, setOpened] = useState(Boolean(rawId));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [requestPage, setRequestPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [reviewing, setReviewing] = useState<{ request: WasteRequest; action: "approve" | "reject" } | null>(null);
  const [rejection, setRejection] = useState("");
  const batches = useWasteBatches(search, page);
  const selected = useWasteBatch(id);
  const selectedBatch = retry?.batch ?? selected.data;
  const requests = useWasteRequests(requestPage);
  const records = useWasteRecords(historyPage);
  const employee = useCurrentEmployee();
  const review = useReviewWaste();
  const reviewingBusy = useRef(false);
  const submittedSuccessfully = () => {
    setSubmitted(true); setOpened(false); setParams({}); setRequestPage(1);
  };
  const full = useFullWaste(submittedSuccessfully);
  const reviewError = wasteErrorInfo(review.error);
  const pending = useWastePending();
  const close = () => { if (!pending) { setOpened(false); setParams({}); } };
  return <Stack gap="lg" maw={1200} mx="auto" style={{ fontVariantNumeric: "tabular-nums", minWidth: 0 }}>
    <PageHeader icon={<TrashIcon size={20} />} title="報廢" description="先申請、後審核；核准後才扣庫存並計入報表。"
      actions={<Button mih={44} onClick={() => { setOpened(true); setSubmitted(false); }}>新增報廢申請</Button>} />
    {(submitted || full.completed) && <Alert role="status" color="green">報廢申請已送出，待管理員審核。</Alert>}
    <FormModal opened={opened || Boolean(rawId)} title="報廢申請" busy={pending} onClose={close}>
      <Stack>
        {!id && <>
          <SearchInput label="搜尋食材或批號" value={search} disabled={pending}
            onChange={e => { setSearch(e.currentTarget.value); setPage(1); }} />
          {batches.isPending && <Loader aria-label="載入批次" />}
          {batches.error && <Alert color="red" role="alert">{batches.error.message}
            <Button variant="default" onClick={() => void batches.refetch()}>重試批次</Button></Alert>}
          {batches.data?.items.length === 0 && <Text>目前沒有符合條件且有剩餘量的批次。</Text>}
          {batches.data?.items.map(b => <Paper withBorder p="sm" key={b.id}>
            <Stack gap="xs"><Text fw={600}>{b.ingredient_name} · {b.batch_number}</Text>
              <Text size="sm">{b.location_name} · {b.remaining_quantity} {b.unit} · 到期 {b.expiry_date}</Text>
              <Button mih={44} variant="default" disabled={pending} onClick={() => setParams({ batch_id: String(b.id) })}>選擇 {b.batch_number}</Button>
            </Stack>
          </Paper>)}
          {batches.data && <Pagination size="lg" styles={{ control: { minWidth: 44, height: 44, fontSize: 14 } }} value={page} onChange={setPage}
            total={Math.max(1, Math.ceil(batches.data.total / batches.data.page_size))} />}
        </>}
        {rawId && id === null && <Alert color="red">批次編號格式錯誤</Alert>}
        {selected.isFetching && id && <Loader aria-label="載入指定批次" />}
        {selected.error && <Alert role="alert" color="red">{selected.error.message}
          <Button variant="default" onClick={() => void selected.refetch()}>重試指定批次</Button></Alert>}
        {selectedBatch && <>
          <WasteForm key={selectedBatch.id} batch={selectedBatch} disabled={pending || selected.isFetching || full.unresolved}
            retry={retry} onUnresolved={setRetry} onSuccess={submittedSuccessfully} />
          <Group justify="space-between">
            <Button variant="default" mih={44} disabled={pending || Boolean(retry)} onClick={() => setParams({})}>移除批次</Button>
            <Button variant="default" mih={44} disabled={pending || selected.isFetching || Boolean(retry)} onClick={() => full.open(selectedBatch)}>全數報廢申請</Button>
          </Group>
        </>}
        <Button variant="default" mih={44} disabled={pending} onClick={close}>取消</Button>
      </Stack>
    </FormModal>
    <FullWasteDialog state={full} />
    <Paper p={20}><Stack>
      <Title order={2} size="h4">報廢申請</Title>
      {requests.isPending && <Loader aria-label="載入報廢申請" />}
      {requests.error && <Alert color="red" role="alert">{requests.error.message}
        <Button variant="default" onClick={() => void requests.refetch()}>重試申請</Button></Alert>}
      {requests.data?.items.length === 0 && <EmptyState icon={<ClipboardIcon size={24} />} title="尚無報廢申請。" />}
      {requests.data?.items.map(r => <Paper key={r.id} withBorder p="md" style={{ overflowWrap: "anywhere" }}>
        <Stack gap="xs">
          <Group justify="space-between"><Text fw={600}>{r.ingredient_name} · {r.batch_number}</Text>
            <Badge color={r.status === "PENDING" ? "yellow" : r.status === "APPROVED" ? "green" : "gray"}>{statuses[r.status]}</Badge></Group>
          <Text>{r.quantity} {r.unit} · {r.location_name} · {reasonLabel(r.reason)} {r.note}</Text>
          <Text size="sm" c="dimmed">申請：{r.operator_name} · {formatDateTime(r.occurred_at)}</Text>
          {r.reviewed_at && <Text size="sm">審核：{r.reviewer_name} · {formatDateTime(r.reviewed_at)} {r.rejection_reason && `· 駁回原因：${r.rejection_reason}`}</Text>}
          <Group>
            {r.transaction_id !== null && <Button component={Link} variant="default" mih={44}
              to={`${routes.reports}?transaction_id=${r.transaction_id}&batch_id=${r.batch_id}`}>查看異動 #{r.transaction_id}</Button>}
            {r.status === "PENDING" && employee.data?.role === "ADMIN" && <>
              <Button variant="default" mih={44} disabled={pending} onClick={() => { review.reset(); setReviewing({ request: r, action: "approve" }); }}>核准申請 #{r.id}</Button>
              <Button variant="default" mih={44} disabled={pending} onClick={() => { review.reset(); setRejection(""); setReviewing({ request: r, action: "reject" }); }}>駁回申請 #{r.id}</Button>
            </>}
          </Group>
        </Stack>
      </Paper>)}
      {requests.data && <Pagination size="lg" styles={{ control: { minWidth: 44, height: 44, fontSize: 14 } }} value={requestPage} onChange={setRequestPage}
        total={Math.max(1, Math.ceil(requests.data.total / requests.data.page_size))} />}
    </Stack></Paper>
    <FormModal opened={reviewing !== null} title={reviewing?.action === "approve" ? "核准並扣除庫存" : "駁回報廢申請"}
      busy={review.isPending} onClose={() => setReviewing(null)} kind="confirm">
      <Stack>
        <Text>{reviewing?.request.ingredient_name} · {reviewing?.request.batch_number} · {reviewing?.request.quantity} {reviewing?.request.unit}</Text>
        {reviewing?.action === "approve" ? <Text>核准時會重新驗證來源及剩餘量，成功後才生效。</Text> :
          <Textarea label="駁回原因（必填）" required maxLength={2000} value={rejection} disabled={review.isPending} onChange={e => setRejection(e.currentTarget.value)} />}
        {review.error && <Alert role="alert" color="red">{review.error.message}
          {reviewError.remaining != null && <Text>最新剩餘量：{String(reviewError.remaining)}，請重新核對申請數量。</Text>}
        </Alert>}
        <Group justify="flex-end">
          <Button variant="default" disabled={review.isPending} onClick={() => setReviewing(null)}>取消審核</Button>
          <Button color="red" loading={review.isPending} disabled={reviewing?.action === "reject" && !rejection.trim()} onClick={async () => {
            if (!reviewing || reviewingBusy.current) return;
            reviewingBusy.current = true;
            try { await review.mutateAsync({ id: reviewing.request.id, action: reviewing.action, reason: rejection }); setReviewing(null); }
            catch { /* 保留原因與申請，供核對後重試。 */ }
            finally { reviewingBusy.current = false; }
          }}>{reviewing?.action === "approve" ? "核准並報廢" : "確認駁回"}</Button>
        </Group>
      </Stack>
    </FormModal>
    <Paper p={20}><Stack>
      <Title order={2} size="h4">已生效報廢紀錄</Title>
      <Text size="sm" c="dimmed">包含歷史已生效紀錄；僅供查詢，不會再次扣量。</Text>
      {records.error && <Alert role="alert" color="red">{records.error.message}<Button variant="default" onClick={() => void records.refetch()}>重試歷史</Button></Alert>}
      {records.isPending && <Loader aria-label="載入報廢紀錄" />}
      {records.data?.items.length === 0 && <EmptyState icon={<ClipboardIcon size={24} />} title="尚無已生效報廢紀錄。" />}
      {records.data?.items.map(r => <Paper key={r.id} withBorder p="md" style={{ overflowWrap: "anywhere" }}><Stack gap="xs">
        <Group justify="space-between"><Text fw={600}>{r.ingredient_name} · {r.batch_number}</Text><Badge color="gray">歷史已生效</Badge></Group>
        <Text>報廢 {r.quantity} {r.unit} · 當時剩餘 {r.quantity_after} {r.unit}</Text>
        <Text size="sm">{reasonLabel(r.reason)} {r.note}</Text>
        <Text size="sm" c="dimmed">{formatDateTime(r.occurred_at)} · {r.operator_name}</Text>
        {"loss_amount" in r && <Text size="sm">損失金額：{r.loss_amount ?? "未知"}</Text>}
        <Button component={Link} variant="default" mih={44} to={`${routes.reports}?transaction_id=${r.transaction_id}&batch_id=${r.batch_id}`}>查看異動 #{r.transaction_id}</Button>
      </Stack></Paper>)}
      {records.data && <Pagination size="lg" styles={{ control: { minWidth: 44, height: 44, fontSize: 14 } }} value={historyPage} onChange={setHistoryPage}
        total={Math.max(1, Math.ceil(records.data.total / records.data.page_size))} />}
    </Stack></Paper>
  </Stack>;
}
