import { Alert, Button, Group, Paper, Skeleton, Stack, Table, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Link } from "react-router";
import { alertActionPath } from "../../../shared/routes";
import { CodeTag } from "../../../shared/ui/CodeTag";
import { DataTable } from "../../../shared/ui/DataTable";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import { FullWasteDialog } from "../../waste/components/FullWasteDialog";
import { useFullWaste } from "../../waste/hooks";
import { useAlerts, type AlertFilters, type AlertItem } from "../hooks";

export function AlertList({ filters, lowStockOnly = false }: { filters: AlertFilters; lowStockOnly?: boolean }) {
  const query = useAlerts(filters);
  const waste = useFullWaste();
  const phone = useMediaQuery("(max-width: 767px)");
  const items = query.data?.items ?? [];
  const actionName = (text: string, item: AlertItem) => `${text} ${item.ingredient_name}${item.batch_number ? ` ${item.batch_number}` : ""}`;
  const actionText = (type: string) => type === "ISSUE" ? "領用" : type === "WASTE" ? "報廢" : "建立進貨單";
  const actions = (item: AlertItem) => <Group gap="xs" wrap="wrap">
    {item.actions.map(action => action.type === "WASTE" && item.status === "EXPIRED" ?
      <Button key={action.type} variant="default" mih={44} disabled={waste.pending} aria-label={actionName("全數報廢", item)}
        onClick={() => waste.open({ id: item.batch_id!, batch_number: item.batch_number!,
          ingredient_name: item.ingredient_name, unit: item.unit, remaining_quantity: action.quantity! })}>全數報廢</Button>
      : <Button key={action.type} component={Link} to={alertActionPath(action)} variant="default" mih={44}
        aria-label={actionName(actionText(action.type), item)}>
        {actionText(action.type)}
      </Button>)}
  </Group>;
  const detail = (item: AlertItem) => item.status === "LOW_STOCK" ? <Stack gap={2}>
    <Text size="sm">全店可用 {item.store_available_quantity} {item.unit}</Text>
    <Text size="xs" c="dimmed">安全量 {item.safety_stock_quantity} · 缺口 {item.shortfall} {item.unit}</Text>
    {filters.locationId && <Text size="xs" c="dimmed">此位置可用 {item.location_available_quantity} {item.unit}</Text>}
  </Stack> : <Stack gap={2}>
    <Text size="sm">{item.remaining_quantity} {item.unit}</Text>
    <Text size="xs" c="dimmed">{item.location_name} · {item.expiry_date}</Text>
  </Stack>;
  return <Stack gap="sm">
    {query.data && <Group justify="space-between"><Text size="xs" c="dimmed">
      更新時間：{new Date(query.data.generated_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}
    </Text><Text size="xs" c="dimmed" role="status">{query.isFetching ? "更新中…" : `${items.length} 項預警`}</Text></Group>}
    {query.error && <Alert color="red" role="alert" title="無法載入預警">
      {query.error.message}<Button variant="default" ml="sm" onClick={() => void query.refetch()}>重試</Button>
      {query.data && <Text size="sm">目前顯示上次資料，尚未更新。</Text>}
    </Alert>}
    {query.isPending && <Stack>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} h={52} />)}</Stack>}
    {query.data && items.length === 0 && <EmptyState title={filters.status || filters.locationId ? "沒有符合條件的預警" : "目前沒有需要處理的食材"}
      tone={!filters.status && !filters.locationId ? "success" : "default"}
      description={lowStockOnly ? "目前沒有低庫存食材。" : "庫存異動後會重新檢查預警。"} />}
    {items.length > 0 && (phone ? <Stack>{items.map(item => <Paper key={`${item.status}-${item.batch_id ?? item.ingredient_id}`} withBorder p="md" radius="lg">
      <Group justify="space-between"><Text fw={700}>{item.ingredient_name}</Text><StatusBadge status={item.status} days={item.days_until_expiry ?? undefined} /></Group>
      {item.batch_number && <CodeTag code={item.batch_number} />}{detail(item)}{actions(item)}
    </Paper>)}</Stack> : <DataTable label={lowStockOnly ? "低庫存預警" : "預警清單"} head={<>
      <Table.Th>食材／批號</Table.Th><Table.Th>狀態</Table.Th><Table.Th>數量／位置／效期</Table.Th><Table.Th>處理</Table.Th>
    </>}>{items.map(item => <Table.Tr key={`${item.status}-${item.batch_id ?? item.ingredient_id}`}>
      <Table.Td><Text fw={700}>{item.ingredient_name}</Text>{item.batch_number && <CodeTag code={item.batch_number} />}</Table.Td>
      <Table.Td><StatusBadge status={item.status} days={item.days_until_expiry ?? undefined} /></Table.Td>
      <Table.Td>{detail(item)}</Table.Td><Table.Td>{actions(item)}</Table.Td>
    </Table.Tr>)}</DataTable>)}
    {waste.completed && <Alert color="green" role="status">報廢申請已送出，待管理員審核；核准前預警仍會保留。</Alert>}
    <FullWasteDialog state={waste} />
  </Stack>;
}
