import { useState } from "react";
import { Alert, Button, Group, Loader, Pagination, Paper, Stack, Table, Text, Textarea, TextInput, Title } from "@mantine/core";
import { useCurrentEmployee } from "../../auth/hooks";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { stocktakeErrorInfo, useStocktake, useStocktakeBatches } from "../hooks";

export function StocktakesPage() {
  const employee = useCurrentEmployee();
  return <Stack gap="lg" maw={1200} mx="auto">
    <PageHeader title="盤點" description="選擇批次、輸入實際量及原因，預覽核對後確認調整。" />
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
  return <Stack>
    <TextInput label="搜尋食材或批號" value={search} maxLength={100} disabled={state.pending}
      onChange={event => { setSearch(event.currentTarget.value); setPage(1); }} />
    {batches.isPending && <Loader aria-label="載入盤點批次" />}
    {batches.isError && <Alert color="red" role="alert">
      {stocktakeErrorInfo(batches.error).message}
      <Button variant="subtle" mih={44} onClick={() => void batches.refetch()}>重試載入批次</Button>
    </Alert>}
    {batches.data && <>
      <Text size="sm">可選擇零庫存批次；已沖銷來源不列入。共 {batches.data.total} 批。</Text>
      {batches.data.items.length === 0 ? <Text>沒有符合條件的批次。</Text> :
        <Table.ScrollContainer minWidth={650}><Table>
          <Table.Thead><Table.Tr><Table.Th>食材／批號</Table.Th><Table.Th>位置／效期</Table.Th>
            <Table.Th>目前帳面量</Table.Th><Table.Th>選擇</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{batches.data.items.map(batch => <Table.Tr key={batch.id}>
            <Table.Td>{batch.ingredient_name} · {batch.batch_number}</Table.Td>
            <Table.Td>{batch.location_name} · {batch.expiry_date}</Table.Td>
            <Table.Td>{batch.remaining_quantity} {batch.unit}</Table.Td>
            <Table.Td><Button mih={44} variant="light" aria-label={`加入 ${batch.batch_number}`}
              disabled={state.pending || state.lines.length >= 100 || state.lines.some(line => line.batch.id === batch.id)}
              onClick={() => state.add(batch)}>加入盤點</Button></Table.Td>
          </Table.Tr>)}</Table.Tbody>
        </Table></Table.ScrollContainer>}
      <Pagination total={Math.max(1, Math.ceil(batches.data.total / batches.data.page_size))}
        value={page} onChange={setPage} disabled={state.pending} />
    </>}
    <Title order={2}>盤點明細</Title>
    {state.lines.length === 0 && <Text>請先加入要盤點的批次。</Text>}
    {state.lines.map((line, index) => <Paper key={line.batch.id} withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between"><Text fw={600}>{label(line.batch.id)}（{line.batch.unit}）</Text>
          <Button variant="subtle" color="red" mih={44} disabled={state.pending}
            aria-label={`移除 ${line.batch.batch_number}`} onClick={() => state.remove(line.batch.id)}>移除</Button></Group>
        <TextInput label={`實際量 ${line.batch.batch_number}`} required inputMode="decimal"
          value={line.actual_quantity} disabled={state.pending} maxLength={13}
          error={state.error.fields.find(field => field.field === `lines.${index}.actual_quantity`)?.message}
          onChange={event => state.edit(line.batch.id, "actual_quantity", event.currentTarget.value)} />
        <Textarea label={`盤點原因 ${line.batch.batch_number}`} required maxLength={2000}
          value={line.reason} disabled={state.pending}
          error={state.error.fields.find(field => field.field === `lines.${index}.reason`)?.message}
          onChange={event => state.edit(line.batch.id, "reason", event.currentTarget.value)} />
      </Stack>
    </Paper>)}
    {state.error.message && <Alert color="red" role="alert">
      <Text>{state.error.message}</Text>
      {typeof state.error.current === "string" && <Text>批次 #{String(state.error.batchId)} 最新帳面量：{state.error.current}</Text>}
      {state.error.status === 409 && <Text>請保留實際盤點資料，重新預覽並核對。</Text>}
      {state.error.fields.filter(field => !/lines\.\d+\.(actual_quantity|reason)/.test(field.field))
        .map(field => <Text key={field.field}>{field.message}</Text>)}
    </Alert>}
    <Button mih={44} disabled={state.pending || !state.lines.length}
      onClick={() => void state.makePreview()}>預覽盤點差額</Button>
    {state.preview && <Paper withBorder p="md"><Stack>
      <Title order={2}>盤點預覽</Title>
      <Text>確認後一次調整全部批次。預覽後若有數量異動，須重新預覽。</Text>
      <Table.ScrollContainer minWidth={600}><Table>
        <Table.Thead><Table.Tr><Table.Th>批次</Table.Th><Table.Th>帳面量</Table.Th><Table.Th>實際量</Table.Th>
          <Table.Th>差額</Table.Th><Table.Th>原因</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{state.preview.lines.map(line => <Table.Tr key={line.batch_id}>
          <Table.Td>{label(line.batch_id)}</Table.Td><Table.Td>{line.expected_quantity}</Table.Td>
          <Table.Td>{line.actual_quantity}</Table.Td><Table.Td>{line.quantity_delta}</Table.Td>
          <Table.Td>{line.reason}</Table.Td>
        </Table.Tr>)}</Table.Tbody>
      </Table></Table.ScrollContainer>
      <Button mih={44} loading={state.pending} disabled={state.pending} onClick={() => void state.confirm()}>確認盤點</Button>
    </Stack></Paper>}
    {state.result && <Alert color="green" role="status" title="盤點已完成">
      {state.result.lines.map(line => <Text key={line.batch_id}>
        {label(line.batch_id)}：調整後 {line.quantity_after}
        {line.transaction_id === null ? "（無差額，未新增異動）" : `（異動 #${line.transaction_id}）`}
      </Text>)}
    </Alert>}
  </Stack>;
}
