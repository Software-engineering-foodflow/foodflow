import { formatDateTime } from "../../../shared/formatDateTime";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Accordion, Alert, Button, Group, Pagination, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { DataTable } from "../../../shared/ui/DataTable";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { ChartIcon, ClipboardIcon, SwapIcon, TrashIcon } from "../../../shared/ui/icons";
import { routes } from "../../../shared/routes";
import { useCurrentEmployee } from "../../auth/hooks";
import { useTransactions, useTransaction, useLocations, useStockReport, useWasteReport, transactionLabels } from "../hooks";
import { TransactionTable } from "../components/TransactionTable";
const reasons: Record<string, string> = { EXPIRED: "過期", SPOILED: "變質", DAMAGED: "損壞", OTHER: "其他" };
export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const [start, setStart] = useState(params.get("start_date") ?? "");
  const [end, setEnd] = useState(params.get("end_date") ?? "");
  const [ingredient, setIngredient] = useState(params.get("ingredient_id") ?? "");
  const [batch, setBatch] = useState(params.get("batch_id") ?? "");
  const [operator, setOperator] = useState(params.get("operator_id") ?? "");
  const [kind, setKind] = useState(params.get("type") ?? "");
  const [groupBy, setGroupBy] = useState("ingredient");
  const [locationPage, setLocationPage] = useState(1);
  const appliedFilters = new URLSearchParams();
  for (const key of ["start_date", "end_date", "ingredient_id", "batch_id", "operator_id", "type"]) {
    if (params.has(key)) appliedFilters.set(key, params.get(key)!);
  }
  const filterKey = appliedFilters.toString();
  useEffect(() => {
    const params = new URLSearchParams(filterKey);
    setStart(params.get("start_date") ?? ""); setEnd(params.get("end_date") ?? "");
    setIngredient(params.get("ingredient_id") ?? ""); setBatch(params.get("batch_id") ?? "");
    setOperator(params.get("operator_id") ?? ""); setKind(params.get("type") ?? "");
    setLocationPage(1);
  }, [filterKey]);
  const current = useCurrentEmployee();
  const query = new URLSearchParams(params);
  query.delete("transaction_id");
  const transactions = useTransactions(query.toString());
  const detail = useTransaction(params.get("transaction_id"));
  const locationParams = new URLSearchParams(query);
  locationParams.delete("type"); locationParams.set("page", String(locationPage));
  const locations = useLocations(locationParams.toString());
  const dates = new URLSearchParams();
  for (const key of ["start_date", "end_date"]) if (params.get(key)) dates.set(key, params.get(key)!);
  const hasDates = dates.has("start_date") && dates.has("end_date");
  const stock = useStockReport(dates.toString(), hasDates);
  const waste = useWasteReport(`${dates}&group_by=${groupBy}`, hasDates && current.data?.role === "ADMIN");
  const changePage = (page: number) => { const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next); };
  return <Stack gap="lg" maw={1200} mx="auto">
    <PageHeader icon={<ChartIcon size={20} />} title="異動與統計" description="依台北日期查詢；起日包含，迄日次日不包含。" />
    <Paper p={20}>
      <form onSubmit={e => {
        e.preventDefault();
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries({ start_date: start, end_date: end, ingredient_id: ingredient,
          batch_id: batch, operator_id: operator, type: kind })) if (v) next.set(k, v);
        setParams(next); setLocationPage(1);
      }}><Stack>
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }}>
          <TextInput type="date" label="起日" value={start} onChange={e => setStart(e.currentTarget.value)} />
          <TextInput type="date" label="迄日" value={end} onChange={e => setEnd(e.currentTarget.value)} />
          <TextInput label="食材編號" inputMode="numeric" value={ingredient} onChange={e => setIngredient(e.currentTarget.value)} />
          <TextInput label="批次編號" inputMode="numeric" value={batch} onChange={e => setBatch(e.currentTarget.value)} />
          <TextInput label="操作者編號" inputMode="numeric" value={operator} onChange={e => setOperator(e.currentTarget.value)} />
          <Select label="異動類型" clearable value={kind || null}
            data={Object.entries(transactionLabels).map(([value, label]) => ({ value, label }))}
            onChange={v => setKind(v ?? "")} />
        </SimpleGrid>
        <Group justify="flex-end"><Button type="submit" mih={44}>套用篩選與日期統計</Button></Group>
      </Stack></form>
    </Paper>
    {detail.error && <Alert role="alert" color="red">{detail.error.message}</Alert>}
    {detail.data && <Paper p={20}><Stack>
      <Title order={2} size="h4">異動 #{detail.data.id} 明細</Title>
      <TransactionTable label={`異動 #${detail.data.id} 明細`} items={[detail.data]} />
    </Stack></Paper>}
    <Paper p={20}><Stack>
      <Title order={2} size="h4">數量異動</Title>
      {transactions.isFetching && <Text role="status" size="sm" c="dimmed">載入異動中…</Text>}
      {transactions.error && <Alert role="alert" color="red">{transactions.error.message}</Alert>}
      {transactions.data?.items.length === 0 ? <EmptyState icon={<ClipboardIcon size={24} />} title="沒有符合條件的異動。" />
        : <TransactionTable items={transactions.data?.items ?? []} />}
      {transactions.data && <Group justify="flex-end"><Pagination role="navigation" aria-label="數量異動分頁" value={Number(params.get("page") ?? 1)} onChange={changePage}
        total={Math.max(1, Math.ceil(transactions.data.total / transactions.data.page_size))} /></Group>}
    </Stack></Paper>
    <Paper p={20}><Stack>
      <Title order={2} size="h4">位置變更</Title>
      <Text size="sm" c="dimmed">位置變更不影響數量，不套用數量異動類型篩選。</Text>
      {locations.error && <Alert role="alert" color="red">{locations.error.message}</Alert>}
      {locations.data?.items.length === 0 ? <EmptyState icon={<SwapIcon size={24} />} title="沒有符合條件的位置變更。" />
        : <DataTable label="位置變更" minWidth={700}
          head={<>{["時間／操作者", "食材／批次", "原位置 → 新位置", "原因"].map(t => <Table.Th key={t}>{t}</Table.Th>)}</>}>
          {locations.data?.items.map(t => <Table.Tr key={t.id}>
            <Table.Td><Text size="sm">{formatDateTime(t.occurred_at)}</Text><Text size="xs" c="dimmed">{t.operator_name}</Text></Table.Td>
            <Table.Td><Text size="sm" fw={600}>{t.ingredient_name}</Text><Link to={`${routes.reports}?batch_id=${t.batch_id}`}>{t.batch_number}</Link></Table.Td>
            <Table.Td>{t.from_location_name} → {t.to_location_name}</Table.Td><Table.Td>{t.reason}</Table.Td>
          </Table.Tr>)}
        </DataTable>}
      {locations.data && <Group justify="flex-end"><Pagination role="navigation" aria-label="位置變更分頁" value={locationPage} onChange={setLocationPage}
        total={Math.max(1, Math.ceil(locations.data.total / locations.data.page_size))} /></Group>}
    </Stack></Paper>
    <Paper p={20}><Stack>
      <Title order={2} size="h4">期初期末統計</Title>
      <Text size="sm" c="dimmed">統計僅套用已提交日期；期初＋淨進貨－淨領用－淨報廢＋調整淨額＝期末。</Text>
      {!hasDates && <EmptyState icon={<ChartIcon size={24} />} title="請填寫起迄日期並套用篩選。" />}
      {stock.error && <Alert role="alert" color="red">{stock.error.message}</Alert>}
      {hasDates && stock.isFetching && <Text role="status" size="sm" c="dimmed">載入統計中…</Text>}
      {stock.data?.length === 0 && <EmptyState icon={<ChartIcon size={24} />} title="此期間沒有庫存統計資料。" />}
      {stock.data && stock.data.length > 0 && <DataTable label="期初期末統計" minWidth={800}
        head={<>{["食材", "單位", "期初", "淨進貨", "淨領用", "淨報廢", "調整", "期末"].map((t, i) =>
          <Table.Th key={t} ta={i > 1 ? "right" : undefined}>{t}</Table.Th>)}</>}>
        {stock.data.map(r => <Table.Tr key={r.ingredient_id}>
          {[r.ingredient_name, r.unit, r.opening, r.receipt, r.issue, r.waste, r.adjustment, r.closing].map((v, i) =>
            <Table.Td key={i} ta={i > 1 ? "right" : undefined} fw={i === 7 ? 600 : undefined}>{v}</Table.Td>)}
        </Table.Tr>)}
      </DataTable>}
    </Stack></Paper>
    {current.data?.role === "ADMIN" && <Paper p={20}><Stack>
      <Group justify="space-between" align="flex-end">
        <Group gap={8}><TrashIcon size={18} aria-hidden="true" /><Title order={2} size="h4">報廢分布</Title></Group>
        <Select label="分組方式" w={180} allowDeselect={false} value={groupBy} onChange={v => v && setGroupBy(v)}
          data={[{ value: "ingredient", label: "食材" }, { value: "category", label: "分類" }, { value: "reason", label: "原因" }]} />
      </Group>
      <Text size="sm" c="dimmed">已知金額合計包含當期沖銷負值；未知成本事件數包含報廢及沖銷事件，並非報廢紀錄去重筆數。不同單位分開核對。</Text>
      {waste.error && <Alert role="alert" color="red">{waste.error.message}</Alert>}
      {waste.data?.length === 0 && <EmptyState icon={<TrashIcon size={24} />} title="此期間沒有報廢事件。" />}
      <Accordion multiple variant="separated">{waste.data?.map(g => <Accordion.Item key={JSON.stringify([g.key, g.unit])} value={JSON.stringify([g.key, g.unit])}>
        <Accordion.Control>{reasons[g.label] ?? g.label} · {g.quantity} {g.unit} · 已知金額 {g.known_loss_amount} · 未知成本事件數 {g.unknown_cost_count}</Accordion.Control>
        <Accordion.Panel><Stack gap="xs">{g.details.map(d => <Text size="sm" key={d.transaction_id}>
          {formatDateTime(d.occurred_at)} · {d.operator_name} · {d.ingredient_name} · {d.batch_number} · {d.quantity} {g.unit} · 金額 {d.loss_amount ?? "未知"} · {reasons[d.reason]} {d.note} ·
          <Link to={`${routes.reports}?transaction_id=${d.transaction_id}`}>{d.reverses_transaction_id ? "沖銷異動" : "報廢異動"} #{d.transaction_id}</Link>
          {d.reverses_transaction_id && <Link to={`${routes.reports}?transaction_id=${d.reverses_transaction_id}`}> 原異動 #{d.reverses_transaction_id}</Link>}
        </Text>)}</Stack></Accordion.Panel>
      </Accordion.Item>)}</Accordion>
    </Stack></Paper>}
  </Stack>;
}
