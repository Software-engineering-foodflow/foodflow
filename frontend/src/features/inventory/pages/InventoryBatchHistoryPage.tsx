import { Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { Link, useParams, useSearchParams } from "react-router";

import { routes } from "../../../shared/routes";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { BatchDetails, InventoryPager, QueryFeedback, useInventoryPage } from "../components/InventoryCommon";
import { useInventoryBatch, useInventoryLocationChanges, useInventoryTransactions } from "../hooks";

const types = { RECEIPT: "進貨", ISSUE: "領用", WASTE: "報廢", ADJUSTMENT: "盤點調整", REVERSAL: "沖銷" };
function time(value: string) { return new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }); }
export function InventoryBatchHistoryPage() {
  const { batchId = "" } = useParams();
  const [params] = useSearchParams();
  const txPage = useInventoryPage("tx_page");
  const locationPage = useInventoryPage("location_page");
  const batch = useInventoryBatch(batchId);
  const transactions = useInventoryTransactions(batchId, txPage);
  const changes = useInventoryLocationChanges(batchId, locationPage);
  return <Stack gap="lg" maw={1200} w="100%" mx="auto" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <PageHeader title="批次異動歷程" description="數量異動與位置變更分開查詢，所有歷程唯讀" />
    <Group><Button component={Link} variant="default" mih={44} to={batch.data ? `${routes.inventory}/${batch.data.ingredient_id}/batches?${params}` : `${routes.inventory}?${params}`}>返回食材批次</Button></Group>
    <QueryFeedback pending={batch.isPending} error={batch.error} retry={batch.refetch} />
    {!batch.error && batch.data && <>
      <Paper withBorder p="lg" radius="md"><BatchDetails batch={batch.data} /></Paper>
      <Title order={2}>數量異動</Title>
      <QueryFeedback pending={transactions.isPending} error={transactions.error} retry={transactions.refetch} />
      {!transactions.error && transactions.data && <>
        {transactions.data.total === 0 && <Text>沒有數量異動紀錄</Text>}
        {transactions.data.items.map((item) => <Paper key={item.id} withBorder p="lg" radius="md"><Stack gap="xs">
          <Group><Text fw={600}>#{item.id} {types[item.type]}</Text>{item.is_non_fefo && <Badge color="orange">非 FEFO</Badge>}</Group>
          <Text>時間：{time(item.occurred_at)} · 操作者：{item.operator_name}</Text>
          <Text>增減量：{item.quantity_delta} {batch.data.unit} · 異動前：{item.quantity_before} {batch.data.unit} → 異動後：{item.quantity_after} {batch.data.unit}</Text>
          <Text style={{ whiteSpace: "pre-wrap" }}>原因：{item.reason || "—"}</Text>
          {item.reverses_transaction_id !== null && <Text>沖銷原紀錄：#{item.reverses_transaction_id}</Text>}
        </Stack></Paper>)}
        <InventoryPager result={transactions.data} pageKey="tx_page" />
      </>}
      <Title order={2}>位置變更</Title>
      <QueryFeedback pending={changes.isPending} error={changes.error} retry={changes.refetch} />
      {!changes.error && changes.data && <>
        {changes.data.total === 0 && <Text>沒有位置變更紀錄</Text>}
        {changes.data.items.map((item) => <Paper key={item.id} withBorder p="lg" radius="md"><Stack gap="xs">
          <Text fw={600}>#{item.id} {item.from_location_name} → {item.to_location_name}</Text>
          <Text>時間：{time(item.occurred_at)} · 操作者：{item.operator_name}</Text>
          <Text style={{ whiteSpace: "pre-wrap" }}>原因：{item.reason}</Text>
        </Stack></Paper>)}
        <InventoryPager result={changes.data} pageKey="location_page" />
      </>}
    </>}
  </Stack>;
}
