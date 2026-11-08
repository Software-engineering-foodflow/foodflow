import { formatDateTime } from "../../../shared/formatDateTime";
import { useState } from "react";
import { useSearchParams, Link } from "react-router";
import { Alert, Button, Group, Loader, Pagination, Paper, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { routes } from "../../../shared/routes";
import { useWasteBatches, useWasteBatch, useWasteRecords, useFullWaste, useWastePending, reasonLabel } from "../hooks";
import { WasteForm } from "../components/WasteForm";
import { FullWasteDialog } from "../components/FullWasteDialog";

export function WasteRecordsPage() {
  const [params, setParams] = useSearchParams();
  const rawId = params.get("batch_id");
  const id = rawId && /^[1-9][0-9]*$/.test(rawId) ? Number(rawId) : null;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const batches = useWasteBatches(search, page);
  const selected = useWasteBatch(id);
  const records = useWasteRecords(historyPage);
  const full = useFullWaste();
  const pending = useWastePending();
  return <Stack gap="lg" maw={1200} mx="auto">
    <PageHeader title="報廢" description="選擇批次、核對數量並保留報廢原因與歷史。" />
    <Paper withBorder p="md"><Stack>
      <Title order={2}>選擇批次</Title>
      <TextInput label="搜尋食材或批號" value={search}
        onChange={e => { setSearch(e.currentTarget.value); setPage(1); }} />
      {batches.isPending && <Loader aria-label="載入批次" />}
      {batches.error && <Alert color="red" role="alert">{batches.error.message}
        <Button onClick={() => void batches.refetch()}>重試批次</Button></Alert>}
      {batches.data?.items.length === 0 && <Text>目前沒有符合條件且有剩餘量的批次。</Text>}
      {batches.data?.items.map(b => <Group key={b.id} justify="space-between">
        <Text>{b.ingredient_name} · {b.batch_number} · {b.remaining_quantity} {b.unit} · {b.location_name} · {b.expiry_date}</Text>
        <Button mih={44} variant="light" disabled={pending} onClick={() => setParams({ batch_id: String(b.id) })}>選擇 {b.batch_number}</Button>
      </Group>)}
      {batches.data && <Pagination value={page} onChange={setPage} total={Math.max(1, Math.ceil(batches.data.total / batches.data.page_size))} />}
    </Stack></Paper>
    {rawId && id === null && <Alert color="red">批次編號格式錯誤</Alert>}
    {selected.isFetching && id && <Loader aria-label="載入指定批次" />}
    {selected.error && <Alert role="alert" color="red">{selected.error.message}</Alert>}
    {selected.data && <Paper withBorder p="md"><Stack>
      <WasteForm key={selected.data.id} batch={selected.data} disabled={pending} />
      <Button color="red" variant="light" mih={44} disabled={pending || selected.isFetching} onClick={() => full.open(selected.data!)}>全數報廢</Button>
    </Stack></Paper>}
    <FullWasteDialog state={full} />
    {full.completed && <Alert role="status" color="green">全數報廢已完成</Alert>}
    <Title order={2}>報廢紀錄</Title>
    {records.error && <Alert role="alert" color="red">{records.error.message}</Alert>}
    {records.isPending && <Loader aria-label="載入報廢紀錄" />}
    {records.data?.items.length === 0 && <Text>尚無報廢紀錄。</Text>}
    <Table.ScrollContainer minWidth={700}><Table>
      <Table.Thead><Table.Tr><Table.Th>時間／操作者</Table.Th><Table.Th>食材／批次</Table.Th><Table.Th>數量／剩餘</Table.Th><Table.Th>原因與說明</Table.Th><Table.Th>異動</Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{records.data?.items.map(r => <Table.Tr key={r.id}>
        <Table.Td>{formatDateTime(r.occurred_at)}<br />{r.operator_name}</Table.Td>
        <Table.Td>{r.ingredient_name}<br />{r.batch_number}</Table.Td>
        <Table.Td>{r.quantity}／{r.quantity_after} {r.unit}
          {"loss_amount" in r && <Text size="sm">損失金額：{r.loss_amount ?? "未知"}</Text>}</Table.Td>
        <Table.Td>{reasonLabel(r.reason)} {r.note}</Table.Td>
        <Table.Td><Link to={`${routes.reports}?transaction_id=${r.transaction_id}&batch_id=${r.batch_id}`}>查看異動 #{r.transaction_id}</Link></Table.Td>
      </Table.Tr>)}</Table.Tbody>
    </Table></Table.ScrollContainer>
    {records.data && <Pagination value={historyPage} onChange={setHistoryPage} total={Math.max(1, Math.ceil(records.data.total / records.data.page_size))} />}
  </Stack>;
}
