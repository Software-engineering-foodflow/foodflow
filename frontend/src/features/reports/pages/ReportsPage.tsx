import { formatDateTime } from "../../../shared/formatDateTime";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Accordion, Alert, Button, Group, Pagination, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { DataTable } from "../../../shared/ui/DataTable";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { ChartIcon, SwapIcon, TrashIcon } from "../../../shared/ui/icons";
import { useCurrentEmployee } from "../../auth/hooks";
import { useTransaction, useLocations, useStockReport, useWasteReport, transactionLabels } from "../hooks";
import { IngredientOverview } from "../components/IngredientOverview";
import { taipeiMonth, validPeriod, reportLink } from "../summary";
const reasons: Record<string, string> = { EXPIRED: "過期", SPOILED: "變質", DAMAGED: "損壞", OTHER: "其他" };
export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const defaults = taipeiMonth();
  const [dateError, setDateError] = useState("");
  const [start, setStart] = useState(params.get("start_date") ?? defaults.start);
  const [end, setEnd] = useState(params.get("end_date") ?? defaults.end);
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
    setStart(params.get("start_date") ?? defaults.start); setEnd(params.get("end_date") ?? defaults.end);
    setIngredient(params.get("ingredient_id") ?? ""); setBatch(params.get("batch_id") ?? "");
    setOperator(params.get("operator_id") ?? ""); setKind(params.get("type") ?? "");
    setLocationPage(1);
  }, [filterKey, defaults.start, defaults.end]);
  const current = useCurrentEmployee();
  const query = new URLSearchParams(params);
  query.delete("transaction_id");
  if (!query.has("start_date")) query.set("start_date", defaults.start);
  if (!query.has("end_date")) query.set("end_date", defaults.end);

  const detail = useTransaction(params.get("transaction_id"));
  const locationParams = new URLSearchParams(query);
  for (const key of ["start_date", "end_date"]) if (!locationParams.get(key)) locationParams.delete(key);
  locationParams.delete("type"); locationParams.set("page", String(locationPage));
  const locations = useLocations(locationParams.toString());
  const dates = new URLSearchParams({ start_date: params.get("start_date") ?? defaults.start, end_date: params.get("end_date") ?? defaults.end });
  for (const key of ["start_date", "end_date"]) if (params.get(key)) dates.set(key, params.get(key)!);
  const hasDates = validPeriod(dates.get("start_date") ?? "", dates.get("end_date") ?? "");
  const stock = useStockReport(dates.toString(), hasDates);
  const waste = useWasteReport(`${dates}&group_by=${groupBy}`, hasDates && current.data?.role === "ADMIN");

  return <Stack gap="lg" maw={1200} mx="auto" style={{ minWidth: 0, fontVariantNumeric: "tabular-nums" }}>
    <PageHeader icon={<ChartIcon size={20} />} title="異動與統計" description="依台北日期查詢；起日包含，迄日次日不包含。" />
    <Paper p={20}>
      <form onSubmit={e => {
        e.preventDefault();
        if (!validPeriod(start, end)) { setDateError("請填寫有效日期，起日不可晚於迄日。"); return; }
        setDateError("");
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries({ start_date: start, end_date: end, ingredient_id: ingredient,
          batch_id: batch, operator_id: operator, type: kind })) if (v) next.set(k, v);
        setParams(next); setLocationPage(1);
      }}><Stack>
        {dateError && <Alert color="red" role="alert">{dateError}</Alert>}
        <Text size="sm" c="dimmed">日期套用至異動與統計；食材、批次、操作者與類型匹配下方食材總覽。</Text>
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }}>
          <TextInput type="date" label="起日" value={start} onChange={e => setStart(e.currentTarget.value)} />
          <TextInput type="date" label="迄日" value={end} onChange={e => setEnd(e.currentTarget.value)} />
          <TextInput label="食材編號" inputMode="numeric" value={ingredient} onChange={e => setIngredient(e.currentTarget.value)} />
          <TextInput label="批次編號" inputMode="numeric" value={batch} onChange={e => setBatch(e.currentTarget.value)} />
          <TextInput label="操作者編號" inputMode="numeric" value={operator} onChange={e => setOperator(e.currentTarget.value)} />
          <Select label="異動類型" placeholder="全部類型" clearable value={kind || null}
            data={Object.entries(transactionLabels).map(([value, label]) => ({ value, label }))}
            onChange={v => setKind(v ?? "")} />
        </SimpleGrid>
        <Group justify="flex-end"><Button variant="default" mih={44} onClick={() => {
          setDateError(""); setStart(""); setEnd(""); setIngredient(""); setBatch(""); setOperator(""); setKind("");
          setParams({ start_date: "", end_date: "" }); setLocationPage(1);
        }}>清除篩選</Button><Button type="submit" mih={44}>套用篩選與日期統計</Button></Group>
      </Stack></form>
    </Paper>
    {detail.error && <Alert role="alert" color="red">{detail.error.message}<Button variant="default" mih={44} onClick={() => void detail.refetch()}>重試</Button></Alert>}
    <IngredientOverview dates={dates.toString()} enabled={hasDates} filters={params} detail={detail.data} closeDetail={() => { const next = new URLSearchParams(params); next.delete("transaction_id"); setParams(next); }} />
    <Paper p={20}><Stack>
      <Title order={2} size="h4">位置變更</Title>
      <Text size="sm" c="dimmed">位置變更不影響數量，不套用數量異動類型篩選。</Text>
      {locations.isFetching && <Text role="status" size="sm" c="dimmed">載入中…</Text>}
      {locations.error && <Alert role="alert" color="red">{locations.error.message}<Button variant="default" mih={44} onClick={() => void locations.refetch()}>重試</Button></Alert>}
      {locations.data?.items.length === 0 ? <EmptyState icon={<SwapIcon size={24} />} title="沒有符合條件的位置變更。" />
        : <DataTable label="位置變更" minWidth={0}
          head={<>{["時間／操作者", "食材／批次", "原位置 → 新位置", "原因"].map(t => <Table.Th key={t}>{t}</Table.Th>)}</>}>
          {locations.data?.items.map(t => <Table.Tr key={t.id}>
            <Table.Td><Text size="sm">{formatDateTime(t.occurred_at)}</Text><Text size="xs" c="dimmed">{t.operator_name}</Text></Table.Td>
            <Table.Td><Text size="sm" fw={600}>{t.ingredient_name}</Text><Link style={{ display: "inline-flex", alignItems: "center", minHeight: 44, minWidth: 44 }} to={reportLink(query, "batch_id", t.batch_id)}>{t.batch_number}</Link></Table.Td>
            <Table.Td>{t.from_location_name} → {t.to_location_name}</Table.Td><Table.Td>{t.reason}</Table.Td>
          </Table.Tr>)}
        </DataTable>}
      {locations.data && <Group justify="flex-end"><Pagination size="lg" styles={{ control: { minWidth: 44, height: 44, fontSize: 14 } }} role="navigation" aria-label="位置變更分頁" value={locationPage} onChange={setLocationPage}
        total={Math.max(1, Math.ceil(locations.data.total / locations.data.page_size))} /></Group>}
    </Stack></Paper>
    <Paper p={20}><Stack>
      <Title order={2} size="h4">期初期末統計</Title>
      <Text size="sm" c="dimmed">統計僅計入已生效異動，待審核與已駁回申請不計入。僅套用已提交日期；期初＋淨進貨－淨領用－淨報廢＋調整淨額＝期末。</Text>
      {!hasDates && <EmptyState icon={<ChartIcon size={24} />} title="請填寫起迄日期並套用篩選。" />}
      {stock.error && <Alert role="alert" color="red">{stock.error.message}<Button variant="default" mih={44} onClick={() => void stock.refetch()}>重試</Button></Alert>}
      {hasDates && stock.isFetching && <Text role="status" size="sm" c="dimmed">載入統計中…</Text>}
      {stock.data?.length === 0 && <EmptyState icon={<ChartIcon size={24} />} title="此期間沒有庫存統計資料。" />}
      {!stock.isFetching && !stock.error && stock.data && stock.data.length > 0 && <DataTable label="期初期末統計" minWidth={0}
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
      {!hasDates && <Text size="sm" c="dimmed">請填寫起迄日期並套用篩選。</Text>}
      {hasDates && waste.isFetching && <Text role="status" size="sm" c="dimmed">載入中…</Text>}
      {waste.error && <Alert role="alert" color="red">{waste.error.message}<Button variant="default" mih={44} onClick={() => void waste.refetch()}>重試</Button></Alert>}
      {waste.data?.length === 0 && <EmptyState icon={<TrashIcon size={24} />} title="此期間沒有報廢事件。" />}
      <Accordion multiple variant="separated">{(!waste.isFetching && !waste.error ? waste.data : undefined)?.map(g => <Accordion.Item key={JSON.stringify([g.key, g.unit])} value={JSON.stringify([g.key, g.unit])}>
        <Accordion.Control>{reasons[g.label] ?? g.label} · {g.quantity} {g.unit} · 已知金額 {g.known_loss_amount} · 未知成本事件數 {g.unknown_cost_count}</Accordion.Control>
        <Accordion.Panel><Stack gap="xs">{g.details.map(d => <Text size="sm" key={d.transaction_id}>
          {formatDateTime(d.occurred_at)} · {d.operator_name} · {d.ingredient_name} · {d.batch_number} · {d.quantity} {g.unit} · 金額 {d.loss_amount ?? "未知"} · {reasons[d.reason]} {d.note} ·
          <Link style={{ display: "inline-flex", alignItems: "center", minHeight: 44, minWidth: 44 }} to={reportLink(query, "transaction_id", d.transaction_id)}>{d.reverses_transaction_id ? "沖銷異動" : "報廢異動"} #{d.transaction_id}</Link>
          {d.reverses_transaction_id && <Link style={{ display: "inline-flex", alignItems: "center", minHeight: 44, minWidth: 44 }} to={reportLink(query, "transaction_id", d.reverses_transaction_id)}> 原異動 #{d.reverses_transaction_id}</Link>}
        </Text>)}</Stack></Accordion.Panel>
      </Accordion.Item>)}</Accordion>
    </Stack></Paper>}
  </Stack>;
}
