import { useState } from "react";
import { Alert, Button, Group, Loader, Pagination, Paper, SimpleGrid, Stack, Table, Text, Textarea, TextInput, Title } from "@mantine/core";
import { useCurrentEmployee } from "../../auth/hooks";
import { DataTable } from "../../../shared/ui/DataTable";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { SearchInput, Toolbar } from "../../../shared/ui/Toolbar";
import { BoxIcon, ClipboardIcon, LayersIcon } from "../../../shared/ui/icons";
import { stocktakeErrorInfo, useStocktake, useStocktakeBatches } from "../hooks";

export function StocktakesPage() {
  const employee = useCurrentEmployee();
  return <Stack gap="lg" maw={1200} mx="auto">
    <PageHeader icon={<ClipboardIcon size={20} />} title="盤點" description="選擇批次、輸入實際量及原因，預覽核對後確認調整。" />
    {employee.isPending ? <Loader aria-label="載入權限" /> : employee.isError ?
      <Alert color="red" role="alert">無法取得登入身分，請重新登入。</Alert> :
      employee.data?.role !== "ADMIN" ?
        <Alert color="red" role="alert">只有管理者可以盤點。</Alert> : <StocktakeForm />}
  </Stack>;
}

function StocktakeForm() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const batches = useStocktakeBatches(search, page);
  const state = useStocktake();
  const label = (id: number) => {
    const batch = state.lines.find(line => line.batch.id === id)?.batch;
    return batch ? `${batch.ingredient_name} · ${batch.batch_number}` : `批次 #${id}`;
  };
  return <Stack gap="lg">
    <Paper p={20}><Stack>
      <Title order={2} size="h4">選擇批次</Title>
      <Toolbar bleed={20} cols={1}>
        <SearchInput label="搜尋食材或批號" value={search} disabled={state.pending}
          onChange={event => { setSearch(event.currentTarget.value); setPage(1); }} />
      </Toolbar>
      {batches.isPending && <Loader aria-label="載入盤點批次" />}
      {batches.isError && <Alert color="red" role="alert">
        {stocktakeErrorInfo(batches.error).message}
        <Button variant="default" mih={44} onClick={() => void batches.refetch()}>重試載入批次</Button>
      </Alert>}
      {batches.data && <>
        <Text size="sm" c="dimmed">可選擇零庫存批次；已沖銷來源不列入。共 {batches.data.total} 批。</Text>
        {batches.data.items.length === 0 ? <EmptyState icon={<BoxIcon size={24} />} title="沒有符合條件的批次。" /> :
          <DataTable label="可盤點的批次" minWidth={650}
            head={<><Table.Th>食材／批號</Table.Th><Table.Th>位置／效期</Table.Th>
              <Table.Th ta="right">目前帳面量</Table.Th><Table.Th aria-label="操作" /></>}>
            {batches.data.items.map(batch => <Table.Tr key={batch.id}>
              <Table.Td><Text size="sm" fw={600}>{batch.ingredient_name}</Text><Text size="xs" c="dimmed">{batch.batch_number}</Text></Table.Td>
              <Table.Td><Text size="sm">{batch.location_name}</Text><Text size="xs" c="dimmed">{batch.expiry_date}</Text></Table.Td>
              <Table.Td ta="right">{batch.remaining_quantity} {batch.unit}</Table.Td>
              <Table.Td ta="right"><Button mih={44} variant="default" aria-label={`加入 ${batch.batch_number}`}
                disabled={state.pending || state.lines.length >= 100 || state.lines.some(line => line.batch.id === batch.id)}
                onClick={() => state.add(batch)}>加入盤點</Button></Table.Td>
            </Table.Tr>)}
          </DataTable>}
        <Group justify="flex-end"><Pagination total={Math.max(1, Math.ceil(batches.data.total / batches.data.page_size))}
          value={page} onChange={setPage} disabled={state.pending} /></Group>
      </>}
    </Stack></Paper>
    <Paper p={20}><Stack>
      <Title order={2} size="h4">盤點明細</Title>
      {state.lines.length === 0 && <EmptyState icon={<LayersIcon size={24} />} title="請先加入要盤點的批次。" />}
      {state.lines.map((line, index) => <Paper key={line.batch.id} withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group justify="space-between"><Text fw={600}>{label(line.batch.id)}（{line.batch.unit}）</Text>
            <Button variant="default" color="red" mih={44} disabled={state.pending}
              aria-label={`移除 ${line.batch.batch_number}`} onClick={() => state.remove(line.batch.id)}>移除</Button></Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label={`實際量 ${line.batch.batch_number}`} required inputMode="decimal"
              value={line.actual_quantity} disabled={state.pending} maxLength={13}
              error={state.error.fields.find(field => field.field === `lines.${index}.actual_quantity`)?.message}
              onChange={event => state.edit(line.batch.id, "actual_quantity", event.currentTarget.value)} />
            <Textarea label={`盤點原因 ${line.batch.batch_number}`} required maxLength={2000} minRows={1}
              value={line.reason} disabled={state.pending}
              error={state.error.fields.find(field => field.field === `lines.${index}.reason`)?.message}
              onChange={event => state.edit(line.batch.id, "reason", event.currentTarget.value)} />
          </SimpleGrid>
        </Stack>
      </Paper>)}
      {state.error.message && <Alert color="red" role="alert">
        <Text>{state.error.message}</Text>
        {typeof state.error.current === "string" && <Text>批次 #{String(state.error.batchId)} 最新帳面量：{state.error.current}</Text>}
        {state.error.status === 409 && <Text>請保留實際盤點資料，重新預覽並核對。</Text>}
        {state.error.fields.filter(field => !/lines\.\d+\.(actual_quantity|reason)/.test(field.field))
          .map(field => <Text key={field.field}>{field.message}</Text>)}
      </Alert>}
      <Group justify="flex-end">
        <Button mih={44} variant={state.preview ? "default" : undefined} disabled={state.pending || !state.lines.length}
          onClick={() => void state.makePreview()}>預覽盤點差額</Button>
      </Group>
    </Stack></Paper>
    {state.preview && <Paper p={20}><Stack>
      <Title order={2} size="h4">盤點預覽</Title>
      <Text size="sm" c="dimmed">確認後一次調整全部批次。預覽後若有數量異動，須重新預覽。</Text>
      <DataTable label="盤點預覽" minWidth={600}
        head={<><Table.Th>批次</Table.Th><Table.Th ta="right">帳面量</Table.Th><Table.Th ta="right">實際量</Table.Th>
          <Table.Th ta="right">差額</Table.Th><Table.Th>原因</Table.Th></>}>
        {state.preview.lines.map(line => <Table.Tr key={line.batch_id}>
          <Table.Td>{label(line.batch_id)}</Table.Td><Table.Td ta="right">{line.expected_quantity}</Table.Td>
          <Table.Td ta="right">{line.actual_quantity}</Table.Td><Table.Td ta="right" fw={600}>{line.quantity_delta}</Table.Td>
          <Table.Td>{line.reason}</Table.Td>
        </Table.Tr>)}
      </DataTable>
      <Group justify="flex-end">
        <Button mih={44} loading={state.pending} disabled={state.pending} onClick={() => void state.confirm()}>確認盤點</Button>
      </Group>
    </Stack></Paper>}
    {state.result && <Alert color="green" role="status" title="盤點已完成">
      {state.result.lines.map(line => <Text key={line.batch_id}>
        {label(line.batch_id)}：調整後 {line.quantity_after}
        {line.transaction_id === null ? "（無差額，未新增異動）" : `（異動 #${line.transaction_id}）`}
      </Text>)}
    </Alert>}
  </Stack>;
}
