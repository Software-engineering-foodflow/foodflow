import { Alert, Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { Link, useSearchParams } from "react-router";

import { routes } from "../../../shared/routes";
import { storageTypeLabels, storageTypeOptions } from "../../../shared/storageTypes";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import { InventoryPager, QueryFeedback, useInventoryPage } from "../components/InventoryCommon";
import { useInventory, useInventoryOptions } from "../hooks";

const statusOptions = [{ value: "NORMAL", label: "正常" }, { value: "EXPIRING_SOON", label: "即期" },
  { value: "EXPIRES_TODAY", label: "今日到期" }, { value: "EXPIRED", label: "過期" }, { value: "LOW_STOCK", label: "低庫存" }];
const clearButtonProps = (field: string) => ({ "aria-label": `清除${field}篩選`, "aria-hidden": false, style: { width: 44, height: 44 }, tabIndex: 0 });
export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const page = useInventoryPage();
  const filters = { search: params.get("search") ?? "", category_id: params.get("category_id") ?? "",
    storage_method: params.get("storage_method") ?? "", location_id: params.get("location_id") ?? "", status: params.get("status") ?? "", page };
  const inventory = useInventory(filters);
  const categories = useInventoryOptions("categories");
  const locations = useInventoryOptions("locations");
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    ["page", "batch_page", "tx_page", "location_page"].forEach((name) => next.delete(name));
    setParams(next, { replace: true });
  }
  const optionData = (values: typeof categories.data) => (values ?? []).map((item) => ({ value: String(item.id), label: `${item.name}${item.is_active ? "" : "（停用）"}` }));
  return <Stack gap="lg" maw={1200} w="100%" mx="auto" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <PageHeader title="庫存" description="查詢食材庫存、批次與異動歷程" />
    <Paper withBorder p="lg" radius="md"><Stack>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <TextInput label="食材名稱" size="md" maxLength={100} value={filters.search} onChange={(e) => change("search", e.currentTarget.value)} />
        <Select label="分類" size="md" searchable clearable clearButtonProps={clearButtonProps("分類")} rightSectionWidth={44} data={optionData(categories.data)} value={filters.category_id || null} onChange={(v) => change("category_id", v ?? "")} />
        <Select label="保存方式" size="md" clearable clearButtonProps={clearButtonProps("保存方式")} rightSectionWidth={44} data={storageTypeOptions} value={filters.storage_method || null} onChange={(v) => change("storage_method", v ?? "")} />
        <Select label="儲存位置" size="md" searchable clearable clearButtonProps={clearButtonProps("儲存位置")} rightSectionWidth={44} data={optionData(locations.data)} value={filters.location_id || null} onChange={(v) => change("location_id", v ?? "")} />
        <Select label="庫存狀態" size="md" clearable clearButtonProps={clearButtonProps("庫存狀態")} rightSectionWidth={44} data={statusOptions} value={filters.status || null} onChange={(v) => change("status", v ?? "")} />
      </SimpleGrid>
      <Group><Button variant="default" mih={44} onClick={() => setParams({})}>清除篩選</Button></Group>
      {(categories.error || locations.error) && <Alert color="red" role="alert">無法載入篩選選單<Button mih={44} onClick={() => { void categories.refetch(); void locations.refetch(); }}>重試選單</Button></Alert>}
      <Alert color="blue">{filters.location_id ? `目前位置：${locations.data?.find((item) => String(item.id) === filters.location_id)?.name ?? "所選儲存位置"}，數量僅合計該位置。` : "目前顯示全店數量。"}低庫存依全店可用量判定。</Alert>
    </Stack></Paper>
    <QueryFeedback pending={inventory.isPending} error={inventory.error} retry={inventory.refetch} />
    {!inventory.error && inventory.data && <>
      <Text>共 {inventory.data.total} 項食材 · 計算日期 {inventory.data.today} · 即期預警 {inventory.data.warning_days} 天</Text>
      {inventory.data.total === 0 && <Paper withBorder p="lg">沒有符合條件的食材</Paper>}
      {inventory.data.items.map((item) => <Paper key={item.ingredient_id} withBorder p="lg" radius="md"><Stack>
        <Group justify="space-between"><Text fw={600}>{item.ingredient_name}</Text><Group>
          <Badge color={item.is_active ? "green" : "gray"}>{item.is_active ? "啟用" : "停用"}</Badge>
          {item.is_low_stock && <StatusBadge status="LOW_STOCK" />}</Group></Group>
        <Text>{item.category_name} · {storageTypeLabels[item.storage_method]} · 單位：{item.unit}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          <Text>實體量：{item.physical_quantity} {item.unit}</Text><Text>可用量：{item.available_quantity} {item.unit}</Text>
          <Text>過期量：{item.expired_quantity} {item.unit}</Text><Text>安全量：{item.safety_stock_quantity} {item.unit}</Text>
          <Text>全店可用量：{item.store_available_quantity} {item.unit}</Text><Text>缺口量：{item.shortfall_quantity} {item.unit}</Text>
        </SimpleGrid>
        <Group><Button component={Link} to={`${routes.inventory}/${item.ingredient_id}/batches?${params}`} variant="light" mih={44}>查看批次：{item.ingredient_name}</Button></Group>
      </Stack></Paper>)}
      <InventoryPager result={inventory.data} />
    </>}
  </Stack>;
}
