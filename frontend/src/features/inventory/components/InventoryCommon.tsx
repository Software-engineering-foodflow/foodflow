import { Alert, Badge, Button, Group, Loader, Pagination, SimpleGrid, Stack, Text } from "@mantine/core";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";

import { routes } from "../../../shared/routes";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import type { Batch } from "../hooks";


export function useInventoryPage(key = "page", result?: { total: number; page_size: number }) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const parsed = Number(raw);
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
  useEffect(() => {
    const last = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : undefined;
    const corrected = last === undefined ? page : Math.min(page, last);
    if ((raw !== null && raw !== String(corrected)) || corrected !== page) {
      const next = new URLSearchParams(params);
      if (corrected === 1) next.delete(key); else next.set(key, String(corrected));
      setParams(next, { replace: true });
    }
  }, [raw, page, key, result, params, setParams]);
  return page;
}

const pagerLabels: Record<string, string> = { page: "庫存總覽", batch_page: "食材批次", tx_page: "數量異動", location_page: "位置變更" };
export function InventoryPager({ result, pageKey = "page" }: { result: { total: number; page_size: number }; pageKey?: string }) {
  const [params, setParams] = useSearchParams();
  const page = useInventoryPage(pageKey, result);
  if (result.total <= result.page_size) return null;
  return <Pagination getItemProps={(page) => ({ "aria-label": `${pagerLabels[pageKey]}第 ${page} 頁` })} getControlProps={(control) => ({ "aria-label": pagerLabels[pageKey] + ({ first: "第一頁", previous: "上一頁", last: "最後一頁", next: "下一頁" })[control] })} aria-label={`${pagerLabels[pageKey]}頁碼`} size="lg" value={page} total={Math.ceil(result.total / result.page_size)}
    styles={{ control: { minWidth: 44, minHeight: 44 } }} onChange={(value) => {
      const next = new URLSearchParams(params); next.set(pageKey, String(value)); setParams(next);
    }} />;
}

export function QueryFeedback({ pending, error, retry }: { pending: boolean; error: Error | null; retry: () => unknown }) {
  if (pending) return <Loader aria-label="載入庫存資料" />;
  if (error) return <Alert title="無法載入庫存資料" color="red" role="alert"><Stack>
    <Text>{error.message}</Text><Button mih={44} onClick={() => void retry()}>重試查詢</Button>
  </Stack></Alert>;
  return null;
}


const receiptLabels = { DRAFT: "草稿", CONFIRMED: "已確認", REVERSED: "已沖銷" };
export function BatchDetails({ batch }: { batch: Batch }) {
  return <Stack gap="sm" style={{ overflowWrap: "anywhere" }}>
    <Group><Text fw={600}>{batch.batch_number}</Text>{batch.is_depleted ? <Badge color="gray">已耗盡</Badge> : <StatusBadge status={batch.expiry_status} />}
      <Badge color="gray">來源{receiptLabels[batch.receipt_status]}</Badge></Group>
    <Text>{batch.ingredient_name} · {batch.unit}</Text>
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
      <Text>位置：{batch.location_name}</Text><Text>進貨日：{batch.received_date}</Text>
      <Text>到期日：{batch.expiry_date}（剩餘 {batch.days_until_expiry} 天）</Text>
      <Text>初始量：{batch.initial_quantity} {batch.unit}</Text><Text>剩餘量：{batch.remaining_quantity} {batch.unit}</Text>
      <Text>供應商：{batch.supplier_name}</Text><Text>來源明細：{batch.source_item_id}</Text>
    </SimpleGrid>
    <Group><Button component={Link} to={`${routes.goodsReceipts}/${batch.receipt_id}`} variant="light" mih={44}>來源進貨單 {batch.receipt_number}</Button></Group>
  </Stack>;
}
