import { formatDateTime } from "../../../shared/formatDateTime";
import { useState } from "react";
import { useSearchParams, Link } from "react-router";
import { Alert, Button, Group, Loader, Pagination, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { DataTable } from "../../../shared/ui/DataTable";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { SearchInput, Toolbar } from "../../../shared/ui/Toolbar";
import { BoxIcon, ClipboardIcon, TrashIcon } from "../../../shared/ui/icons";
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
    <PageHeader icon={<TrashIcon size={20} />} title="報廢" description="選擇批次、核對數量並保留報廢原因與歷史。" />
    <Paper p={20}><Stack>
      <Title order={2} size="h4">選擇批次</Title>
      <Toolbar bleed={20} cols={1}>
        <SearchInput label="搜尋食材或批號" value={search}
          onChange={e => { setSearch(e.currentTarget.value); setPage(1); }} />
      </Toolbar>
      {batches.isPending && <Loader aria-label="載入批次" />}
      {batches.error && <Alert color="red" role="alert">{batches.error.message}
        <Button variant="default" onClick={() => void batches.refetch()}>重試批次</Button></Alert>}
      {batches.data?.items.length === 0 && <EmptyState icon={<BoxIcon size={24} />}
        title="目前沒有符合條件且有剩餘量的批次。" />}
      {batches.data && batches.data.items.length > 0 && <DataTable label="可報廢的批次" minWidth={700}
        head={<><Table.Th>食材／批號</Table.Th><Table.Th ta="right">剩餘量</Table.Th><Table.Th>位置</Table.Th>
          <Table.Th>到期日</Table.Th><Table.Th aria-label="操作" /></>}>
        {batches.data.items.map(b => <Table.Tr key={b.id} aria-selected={b.id === id}>
          <Table.Td><Text fw={600} size="sm">{b.ingredient_name}</Text><Text size="xs" c="dimmed">{b.batch_number}</Text></Table.Td>
          <Table.Td ta="right">{b.remaining_quantity} {b.unit}</Table.Td>
          <Table.Td>{b.location_name}</Table.Td>
          <Table.Td>{b.expiry_date}</Table.Td>
          <Table.Td ta="right"><Button mih={44} variant={b.id === id ? "light" : "default"} disabled={pending}
            onClick={() => setParams({ batch_id: String(b.id) })}>選擇 {b.batch_number}</Button></Table.Td>
        </Table.Tr>)}
      </DataTable>}
      {batches.data && <Group justify="flex-end"><Pagination value={page} onChange={setPage}
        total={Math.max(1, Math.ceil(batches.data.total / batches.data.page_size))} /></Group>}
    </Stack></Paper>
    {rawId && id === null && <Alert color="red">批次編號格式錯誤</Alert>}
    {selected.isFetching && id && <Loader aria-label="載入指定批次" />}
    {selected.error && <Alert role="alert" color="red">{selected.error.message}</Alert>}
    {selected.data && <Paper p={20}><Stack>
      <WasteForm key={selected.data.id} batch={selected.data} disabled={pending} />
      <Group justify="flex-end">
        <Button color="red" variant="default" mih={44} disabled={pending || selected.isFetching}
          onClick={() => full.open(selected.data!)}>全數報廢</Button>
      </Group>
    </Stack></Paper>}
    <FullWasteDialog state={full} />
    {full.completed && <Alert role="status" color="green">全數報廢已完成</Alert>}
    <Paper p={20}><Stack>
      <Title order={2} size="h4">報廢紀錄</Title>
      {records.error && <Alert role="alert" color="red">{records.error.message}</Alert>}
      {records.isPending && <Loader aria-label="載入報廢紀錄" />}
      {records.data?.items.length === 0 && <EmptyState icon={<ClipboardIcon size={24} />} title="尚無報廢紀錄。" />}
      {records.data && records.data.items.length > 0 && <DataTable label="報廢紀錄" minWidth={760}
        head={<><Table.Th>時間／操作者</Table.Th><Table.Th>食材／批次</Table.Th><Table.Th ta="right">數量／剩餘</Table.Th>
          <Table.Th>原因與說明</Table.Th><Table.Th>異動</Table.Th></>}>
        {records.data.items.map(r => <Table.Tr key={r.id}>
          <Table.Td><Text size="sm">{formatDateTime(r.occurred_at)}</Text><Text size="xs" c="dimmed">{r.operator_name}</Text></Table.Td>
          <Table.Td><Text size="sm" fw={600}>{r.ingredient_name}</Text><Text size="xs" c="dimmed">{r.batch_number}</Text></Table.Td>
          <Table.Td ta="right">{r.quantity}／{r.quantity_after} {r.unit}
            {"loss_amount" in r && <Text size="xs" c="dimmed">損失金額：{r.loss_amount ?? "未知"}</Text>}</Table.Td>
          <Table.Td>{reasonLabel(r.reason)} {r.note}</Table.Td>
          <Table.Td><Link to={`${routes.reports}?transaction_id=${r.transaction_id}&batch_id=${r.batch_id}`}>查看異動 #{r.transaction_id}</Link></Table.Td>
        </Table.Tr>)}
      </DataTable>}
      {records.data && <Group justify="flex-end"><Pagination value={historyPage} onChange={setHistoryPage}
        total={Math.max(1, Math.ceil(records.data.total / records.data.page_size))} /></Group>}
    </Stack></Paper>
  </Stack>;
}
