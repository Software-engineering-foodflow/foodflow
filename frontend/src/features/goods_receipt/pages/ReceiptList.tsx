import { Alert, Badge, Button, Group, Loader, Pagination, Paper, Select, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";

import { routes } from "../../../shared/routes";
import { useReceiptOptions, useReceipts } from "../hooks";

export function ReceiptList() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get("page"));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const filters = { receipt_number: params.get("receipt_number") ?? "", date_from: params.get("date_from") ?? "",
    date_to: params.get("date_to") ?? "", supplier_id: params.get("supplier_id") ?? "",
    ingredient_id: params.get("ingredient_id") ?? "", page };
  const receipts = useReceipts(filters);
  const suppliers = useReceiptOptions("suppliers", true);
  const ingredients = useReceiptOptions("ingredients", true);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }
  useEffect(() => {
    const result = receipts.data;
    if (!result) return;
    const lastPage = Math.max(1, Math.ceil(result.total / result.page_size));
    if (page > lastPage) {
      const next = new URLSearchParams(params);
      if (lastPage === 1) next.delete("page"); else next.set("page", String(lastPage));
      setParams(next, { replace: true });
    }
  }, [receipts.data, page, params, setParams]);
  const options = (values: typeof suppliers.data) => (values ?? []).map((item) => ({ value: String(item.id), label: item.name }));
  return <Stack>
    <Paper withBorder p="lg" radius="md"><Stack>
      <Text fw={600}>查詢進貨</Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <TextInput label="查詢單號" size="md" value={filters.receipt_number} onChange={(e) => change("receipt_number", e.currentTarget.value)} />
        <TextInput label="進貨起日" size="md" type="date" value={filters.date_from} onChange={(e) => change("date_from", e.currentTarget.value)} />
        <TextInput label="進貨迄日" size="md" type="date" value={filters.date_to} onChange={(e) => change("date_to", e.currentTarget.value)} />
        <Select label="查詢供應商" size="md" searchable clearable rightSectionWidth={44} clearButtonProps={{ "aria-label": "清除查詢條件", "aria-hidden": false, tabIndex: 0, style: { width: 44, height: 44, minWidth: 44, minHeight: 44 } }} data={options(suppliers.data)} value={filters.supplier_id || null} onChange={(v) => change("supplier_id", v ?? "")} />
        <Select label="查詢食材" size="md" searchable clearable rightSectionWidth={44} clearButtonProps={{ "aria-label": "清除查詢條件", "aria-hidden": false, tabIndex: 0, style: { width: 44, height: 44, minWidth: 44, minHeight: 44 } }} data={options(ingredients.data)} value={filters.ingredient_id || null} onChange={(v) => change("ingredient_id", v ?? "")} />
      </SimpleGrid>
      <Group><Button variant="default" mih={44} onClick={() => setParams({})}>清除篩選</Button></Group>
      {(suppliers.error || ingredients.error) && <Alert color="red" role="alert"><Text>無法載入查詢選單</Text><Button mih={44} onClick={() => { void suppliers.refetch(); void ingredients.refetch(); }}>重新載入查詢選單</Button></Alert>}
    </Stack></Paper>
    {receipts.isPending && <Loader aria-label="載入進貨列表" />}
    {receipts.error && <Alert color="red" role="alert"><Text>{receipts.error.message}</Text><Button mih={44} onClick={() => void receipts.refetch()}>重試查詢</Button></Alert>}
    {receipts.data && <>
      <Text>共 {receipts.data.total} 筆進貨</Text>
      {receipts.data.total === 0 && <Paper withBorder p="lg"><Text>沒有符合條件的進貨單</Text></Paper>}
      {receipts.data.total > 0 && !receipts.data.items.length && <Text role="status">此頁已無資料，正在返回有效頁面。</Text>}
      {receipts.data.items.map((receipt) => <Paper key={receipt.id} withBorder p="md" radius="md"><Group justify="space-between" wrap="wrap">
        <Stack gap={4}><Text fw={600}>{receipt.receipt_number}</Text><Text>{receipt.receipt_date} · {receipt.supplier_name}</Text></Stack>
        <Group><Badge>{receipt.status === "DRAFT" ? "草稿" : receipt.status === "CONFIRMED" ? "已確認" : "已沖銷"}</Badge>
          <Button component={Link} variant="light" mih={44} to={`${routes.goodsReceipts}/${receipt.id}?${params}`}>查看 {receipt.receipt_number}</Button></Group>
      </Group></Paper>)}
      {receipts.data.total > receipts.data.page_size && <Pagination value={filters.page} total={Math.ceil(receipts.data.total / receipts.data.page_size)} onChange={(page) => change("page", String(page))} size="lg" styles={{ control: { minWidth: 44, minHeight: 44 } }} />}
    </>}
  </Stack>;
}
