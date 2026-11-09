import { Alert, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { Link, useParams, useSearchParams } from "react-router";

import { routes } from "../../../shared/routes";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { BatchDetails, InventoryPager, QueryFeedback, useInventoryPage } from "../components/InventoryCommon";
import { useInventoryBatches, useInventoryOptions } from "../hooks";

export function InventoryBatchesPage() {
  const { ingredientId = "" } = useParams();
  const [params] = useSearchParams();
  const page = useInventoryPage("batch_page");
  const locations = useInventoryOptions("locations");
  const locationId = params.get("location_id") ?? "";
  const batches = useInventoryBatches(ingredientId, { location_id: locationId, page });
  return <Stack gap="lg" maw={1200} w="100%" mx="auto" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <PageHeader title="食材批次" description="依到期日、進貨日及批號排序，包含耗盡與沖銷歷史" />
    <Group><Button component={Link} variant="default" mih={44} to={`${routes.inventory}?${params}`}>返回庫存總覽</Button></Group>
    {locationId && <Alert color="blue">僅顯示{locations.data?.find((item) => String(item.id) === locationId)?.name ?? "所選儲存位置"}的批次。</Alert>}
    {locationId && locations.error && <Alert color="red" role="alert"><Stack>
      <Text>無法載入所選位置名稱</Text><Button mih={44} onClick={() => void locations.refetch()}>重試位置名稱</Button>
    </Stack></Alert>}
    <QueryFeedback pending={batches.isPending} error={batches.error} retry={batches.refetch} />
    {!batches.error && batches.data && <>
      <Text fw={600}>{batches.data.ingredient_name} · {batches.data.unit} · 共 {batches.data.total} 個批次</Text>
      {batches.data.total === 0 && <Paper withBorder p="lg">此食材目前沒有符合條件的批次</Paper>}
      {batches.data.items.map((batch) => <Paper key={batch.id} withBorder p="lg" radius="md"><Stack>
        <BatchDetails batch={batch} />
        <Group><Button component={Link} variant="light" mih={44} to={`${routes.inventory}/batches/${batch.id}?${params}`}>查看異動：{batch.batch_number}</Button></Group>
      </Stack></Paper>)}
      <InventoryPager result={batches.data} pageKey="batch_page" />
    </>}
  </Stack>;
}
