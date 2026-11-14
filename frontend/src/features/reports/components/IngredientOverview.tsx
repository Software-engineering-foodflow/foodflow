import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Badge, Button, Drawer, Paper, SimpleGrid, Stack, Table, Tabs, Text, Title, Tooltip } from '@mantine/core';
import { DataTable } from '../../../shared/ui/DataTable';
import { SearchInput, Toolbar } from '../../../shared/ui/Toolbar';
import { routes } from '../../../shared/routes';
import { useAllTransactions, useStockReport, type Transaction } from '../hooks';
import { quantity, reconcile } from '../summary';
import { QuantityPill } from './QuantityPill';
import { TransactionTable } from './TransactionTable';

export function IngredientOverview({ dates, enabled, filters, detail, closeDetail }: { dates: string; enabled: boolean; filters: URLSearchParams; detail?: Transaction; closeDetail?: () => void }) {
  const transactions = useAllTransactions(dates, enabled);
  const stock = useStockReport(dates, enabled);
  const [search, setSearch] = useState('');
  const [attention, setAttention] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<string | null>('all');
  useEffect(() => { setTab('all'); }, [detail?.id]);
  const loaded = enabled && !transactions.isFetching && !stock.isFetching && !transactions.error && !stock.error && !!transactions.data && !!stock.data;
  let rows: ReturnType<typeof reconcile> = [];
  let aggregationError = '';
  if (loaded) {
    try { rows = reconcile(transactions.data!, stock.data!); }
    catch (error) { aggregationError = error instanceof Error ? error.message : '無法彙總資料，請重試。'; }
  }
  const ready = loaded && !aggregationError;
  const errorMessage = transactions.error?.message ?? stock.error?.message ?? aggregationError;
  const visible = rows.filter(row => (!attention || row.attention) &&
    (!search.trim() || [row.name, String(row.id), ...row.items.map(t => t.batch_number)].some(v => v.toLowerCase().includes(search.trim().toLowerCase()))) &&
    (!filters.get('ingredient_id') || String(row.id) === filters.get('ingredient_id')) &&
    row.items.some(t => (!filters.get('batch_id') || String(t.batch_id) === filters.get('batch_id')) && (!filters.get('operator_id') || String(t.operator_id) === filters.get('operator_id')) && (!filters.get('type') || t.type === filters.get('type'))));
  const units = new Map<string, { receipts: bigint; loss: bigint; count: number }>();
  for (const row of visible) {
    const value = units.get(row.unit) ?? { receipts: 0n, loss: 0n, count: 0 };
    value.receipts += row.receipts; value.loss += row.loss; value.count += row.receiptCount; units.set(row.unit, value);
  }
  const row = detail ? { id: detail.ingredient_id, name: detail.ingredient_name, items: [detail] } : rows.find(r => r.id === selected);
  const balance = ready ? stock.data?.find(r => r.ingredient_id === (detail?.ingredient_id ?? selected)) : undefined;
  const detailDay = detail ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(detail.occurred_at)) : '';
  const outsidePeriod = detail && (!enabled || detailDay < (new URLSearchParams(dates).get('start_date') ?? '') || detailDay > (new URLSearchParams(dates).get('end_date') ?? ''));
  const statisticsStatus = !enabled ? '未選擇有效日期區間，暫無期間統計。' : errorMessage ? `期間統計無法顯示：${errorMessage}` : '期間統計載入中，暫不顯示期初期末。';
  const categories = [ { value: 'all', label: '全部異動', accepts: () => true },
    { value: 'loss', label: '報廢 / 盤虧', accepts: (t: Transaction) => t.type === 'WASTE' || (t.type === 'ADJUSTMENT' && t.quantity_delta.startsWith('-')) },
    { value: 'receipt', label: '進貨入庫', accepts: (t: Transaction) => t.type === 'RECEIPT' },
    { value: 'nonfefo', label: '非 FEFO 紀錄', accepts: (t: Transaction) => t.is_non_fefo } ];
  const statusStyle = { root: { height: 'auto', maxWidth: '100%', paddingTop: 4, paddingBottom: 4 }, label: { whiteSpace: 'normal' as const, overflow: 'visible', textOverflow: 'clip', lineHeight: 1.5 } };
  const openRow = (id: number) => { setSelected(id); setTab('all'); };
  const close = () => { setSelected(null); closeDetail?.(); };
  return <Paper p={20}><Stack>
    <Title order={2} size="h4">食材期間總覽</Title>
    <Toolbar cols={{ base: 1, sm: 2 }}><SearchInput label="搜尋名稱、食材 ID 或批號" value={search} onChange={e => setSearch(e.currentTarget.value)} />
      <Button variant="default" mih={44} mt="auto" aria-pressed={attention} onClick={() => setAttention(!attention)}>{attention ? '顯示全部食材' : '只看關注食材'}</Button></Toolbar>
    <Text size="sm" c="dimmed">進貨採實際進貨事件；損耗採報廢及盤虧，未扣沖銷。搜尋或批次條件匹配食材後，仍統計該食材整個區間。</Text>
    {!enabled && <Text>請填寫有效起迄日期。</Text>}
    {enabled && (transactions.isFetching || stock.isFetching) && <Text role="status">載入完整區間中…</Text>}
    {errorMessage && <Alert color="red" role="alert">{errorMessage}<Button variant="default" onClick={() => { void transactions.refetch(); void stock.refetch(); }}>重試</Button></Alert>}
    {ready && <><SimpleGrid cols={{ base: 1, sm: 3 }}>
      <Paper withBorder p="md"><Text fw={700}>期間總進貨</Text><Text size="xs" c="dimmed">實際入庫筆數與數量，依單位列示</Text>{units.size === 0 && <Text size="lg" fw={700}>0 筆 · 無異動</Text>}{[...units].map(([unit, value]) => <Text key={unit} size="lg" fw={700}>{value.count} 筆 · {quantity(value.receipts)} {unit}</Text>)}</Paper>
      <Paper withBorder p="md"><Text fw={700}>期間報廢與損耗</Text><Text size="xs" c="dimmed">報廢與盤虧事件總量，未扣沖銷</Text>{units.size === 0 && <Text size="lg" fw={700}>無損耗異動</Text>}{[...units].map(([unit, value]) => <Tooltip events={{ hover: true, focus: true, touch: false }} key={unit} label="報廢數量加上盤點短少數量，未扣除沖銷事件。" withArrow><Text tabIndex={0} size="lg" fw={700}>{quantity(value.loss)} {unit}</Text></Tooltip>)}</Paper>
      <Paper withBorder p="md"><Text fw={700}>異常關注食材</Text><Text size="lg" fw={700}>{visible.filter(r => r.attention).length} 項</Text><Text size="xs" c="dimmed">報廢、盤虧或非 FEFO</Text></Paper>
    </SimpleGrid>
    <Text size="sm" c="dimmed">點擊任一食材可展開該期間的詳細批次與異動流水帳</Text>
    {!visible.length ? <Text>沒有符合條件的異動。</Text> : <DataTable label="食材期間總覽" minWidth={0} head={<><Table.Th w="18%" px={8}>食材</Table.Th><Table.Th w="28%" px={8}>期間數量</Table.Th><Table.Th w="18%" px={8}>期初 → 期末</Table.Th><Table.Th w="16%" px={8}>狀態</Table.Th><Table.Th w="20%" px={8}>明細</Table.Th></>}>
      {visible.map(r => { const balance = stock.data?.find(b => b.ingredient_id === r.id); return <Table.Tr key={r.id} onClick={() => openRow(r.id)} style={{ cursor: 'pointer' }}>
        <Table.Td px={8}><Text size="lg" fw={700}>{r.name}</Text><Text size="xs" c="dimmed">#{r.id} · {r.unit}</Text></Table.Td>
        <Table.Td px={8}><Stack gap={4}><QuantityPill label="進貨" value={quantity(r.receipts)} unit={r.unit} /><QuantityPill label="領用" value={quantity(-r.issued)} unit={r.unit} /><QuantityPill label="報廢" value={quantity(-r.wasted)} unit={r.unit} color="red" />{r.shortage > 0n && <QuantityPill label="盤虧" value={quantity(-r.shortage)} unit={r.unit} color="red" />}</Stack></Table.Td>
        <Table.Td px={8}><Tooltip events={{ hover: true, focus: true, touch: false }} label="期初加淨進貨，扣淨領用和淨報廢，再加調整淨額，等於期末；包含沖銷。" withArrow><Text tabIndex={0} fw={700}>{balance ? `${balance.opening} → ${balance.closing}` : '—'}</Text></Tooltip></Table.Td>
        <Table.Td px={8}><Stack gap={4}>{r.loss > 0n && <Badge styles={statusStyle} color="red" variant="light">● 報廢／盤虧</Badge>}{r.items.some(t => t.is_non_fefo) && <Badge styles={statusStyle} color="orange" variant="light">● 非 FEFO</Badge>}{!r.attention && <Badge styles={statusStyle} color="forest" variant="light">● 正常</Badge>}</Stack></Table.Td>
        <Table.Td px={8}><Button variant="default" mih={44} px={8} styles={{ label: { whiteSpace: 'normal' } }} aria-label={`查看 ${r.name} 明細`} onClick={e => { e.stopPropagation(); openRow(r.id); }}>查看明細（共{r.items.length}筆）›</Button></Table.Td></Table.Tr>; })}
    </DataTable>}</>}
    <Drawer opened={selected !== null || !!detail} onClose={close} position="right" size="min(900px, 100vw)" title={<Stack gap={4}><Text size="lg" fw={700}>{row?.name ?? '食材'} #{row?.id}</Text><Text size="sm">{new URLSearchParams(dates).get('start_date')} 至 {new URLSearchParams(dates).get('end_date')}{detail && ` · 異動 #${detail.id}`}</Text>{row && <Button component={Link} variant="default" to={`${routes.inventory}/${row.id}/batches`} mih={44}>查看食材庫存</Button>}</Stack>} closeButtonProps={{ 'aria-label': '關閉食材明細', size: 44 }} styles={{ header: { position: 'sticky', top: 0 }, body: { overflowWrap: 'anywhere' } }}>
      {row && <Stack>
        {detail && <Text size="sm">單筆追溯：異動 #{detail.id}，台北日期 {detailDay}。</Text>}
        {outsidePeriod && <Alert color="orange">此單筆異動不在選定日期區間內；下方期間統計不代表此單筆異動的數據。</Alert>}
        {ready && balance && <Text size="sm" c="dimmed">以下為選定日期區間的食材整體庫存統計，非單筆異動數據。</Text>}
        {balance ? <Tooltip events={{ hover: true, focus: true, touch: false }} label="期初庫存加進貨，扣領用與報廢，再加盤點調整；各項淨值均已含沖銷。" withArrow><Text tabIndex={0}>期初 {balance.opening} {balance.unit} ＋ 淨進貨 {balance.receipt} {balance.unit} − 淨領用 {balance.issue} {balance.unit} − 淨報廢 {balance.waste} {balance.unit} ＋ 調整淨額 {balance.adjustment} {balance.unit} ＝ 期末 {balance.closing} {balance.unit}（含沖銷）</Text></Tooltip> : <Text>{ready ? "此食材無期初期末統計。" : statisticsStatus}</Text>}
        <Tabs value={tab} onChange={setTab}><Tabs.List>{categories.map(c => <Tabs.Tab key={c.value} value={c.value} mih={44}>{c.label}（{row.items.filter(c.accepts).length}）</Tabs.Tab>)}</Tabs.List></Tabs>
        <Text size="sm" c="dimmed">新到舊排列 · 共 {row.items.filter(categories.find(c => c.value === tab)!.accepts).length} 筆</Text>
        <TransactionTable items={row.items.filter(categories.find(c => c.value === tab)!.accepts).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id)} />
      </Stack>}
      {!ready && !detail && <Text>{statisticsStatus} 暫不顯示區間明細。</Text>}
    </Drawer>
  </Stack></Paper>;
}
