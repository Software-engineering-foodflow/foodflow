import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import type { Transaction } from './api';
import { IngredientOverview } from './components/IngredientOverview';
import { ReportsPage } from './pages/ReportsPage';
import { queryKeys } from '../../shared/api/queryKeys';
const json = (x: unknown) => new Response(JSON.stringify(x));
const base: Transaction = { id: 1, ingredient_id: 1, ingredient_name: '雞肉', batch_id: 1, batch_number: 'B-1', unit: '公斤', type: 'RECEIPT', quantity_delta: '5.000', quantity_before: '0.000', quantity_after: '5.000', occurred_at: '2025-01-06T00:00:00Z', operator_id: 1, operator_name: '甲', reason: '', is_non_fefo: false, source_receipt_id: 1, source_receipt_number: 'GR-1', source_item_id: 1, operation_group_id: 'uuid', reverses_transaction_id: null };
const events: Transaction[] = [base, { ...base, id: 2, batch_id: 2, batch_number: 'B-2', operator_id: 2, type: 'WASTE', quantity_delta: '-2.000' }, { ...base, id: 3, type: 'ADJUSTMENT', quantity_delta: '-1.000' }, { ...base, id: 4, type: 'ISSUE', quantity_delta: '-1.000' }, { ...base, id: 5, ingredient_id: 2, ingredient_name: '豆', unit: '包', quantity_delta: '2.000' }];
const balances = [{ ingredient_id: 1, ingredient_name: '雞肉', unit: '公斤', opening: '0.000', closing: '1.000', receipt: '5.000', issue: '1.000', waste: '2.000', adjustment: '-1.000' }, { ingredient_id: 2, ingredient_name: '豆', unit: '包', opening: '0.000', closing: '2.000', receipt: '2.000', issue: '0.000', waste: '0.000', adjustment: '0.000' }];
const dates = 'start_date=2025-01-01&end_date=2025-01-31';
function setup(options: { overview?: boolean; detail?: Transaction; stock?: unknown[]; items?: Transaction[]; entry?: string } = {}) {
  const fetch = vi.fn(async (url: string) => {
    if (url.includes('/auth/me')) return json({ id: 1, name: '甲', role: 'STAFF' });
    if (url.includes('/reports/stock')) return json(options.stock ?? balances);
    if (url.includes('/inventory-transactions?')) return json({ items: options.items ?? events, total: (options.items ?? events).length });
    if (url.includes('/inventory-transactions/')) return json(options.detail ?? base);
    return json({ items: [], total: 0, page: 1, page_size: 20 });
  });
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MantineProvider env="test"><QueryClientProvider client={client}><MemoryRouter initialEntries={[options.entry ?? `/reports?${dates}`]}>{options.overview ? <IngredientOverview dates={dates} enabled filters={new URLSearchParams()} detail={options.detail} /> : <ReportsPage />}</MemoryRouter></QueryClientProvider></MantineProvider>);
  return { fetch, client };
}
it('清除日期驗證錯誤且位置API省略空日期', async () => {
  const { fetch } = setup(); await screen.findByRole('button', { name: '查看 雞肉 明細' });
  fireEvent.change(screen.getByLabelText('起日'), { target: { value: '2025-02-01' } });
  fireEvent.click(screen.getByRole('button', { name: '套用篩選與日期統計' }));
  expect(screen.getByText('請填寫有效日期，起日不可晚於迄日。')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '清除篩選' }));
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes('/batch-location-changes?') && !url.includes('start_date') && !url.includes('end_date'))).toBe(true));
  expect(screen.queryByText('請填寫有效日期，起日不可晚於迄日。')).toBeNull();
});
it.each([{ ingredient: '1' }, { batch: '2' }, { operator: '2' }, { kind: '報廢' }, { ingredient: '1', batch: '2', operator: '2', kind: '報廢' }])('表單篩選%s匹配食材但保留整區間總量', async filter => {
  setup(); await screen.findByRole('button', { name: '查看 豆 明細' });
  for (const [field, label] of [['ingredient', '食材編號'], ['batch', '批次編號'], ['operator', '操作者編號']] as const) if (filter[field]) fireEvent.change(screen.getByLabelText(label), { target: { value: filter[field] } });
  if (filter.kind) { fireEvent.click(screen.getByRole('combobox', { name: '異動類型' })); fireEvent.click(await screen.findByRole('option', { name: filter.kind })); }
  fireEvent.click(screen.getByRole('button', { name: '套用篩選與日期統計' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '查看 豆 明細' })).toBeNull());
  const table = screen.getByRole('table', { name: '食材期間總覽' });
  expect(within(table).getByText('● 進貨 +5.000 公斤')).toBeTruthy();
  expect(within(table).getByText('● 領用 -1.000 公斤')).toBeTruthy();
  expect(within(table).getByText('● 報廢 -2.000 公斤')).toBeTruthy();
  expect(within(table).getByText('● 盤虧 -1.000 公斤')).toBeTruthy();
});
it('歷史追溯保留URL context且批次導向真正歷程，區間外單筆明確標示', async () => {
  setup({ detail: { ...base, occurred_at: '2024-12-01T00:00:00Z' }, entry: `/reports?${dates}&operator_id=1&transaction_id=1` });
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/此單筆異動不在選定日期區間內/)).toBeTruthy();
  const transaction = new URL(within(dialog).getByRole('link', { name: '異動 #1' }).getAttribute('href')!, 'http://local');
  expect(transaction.searchParams.get('start_date')).toBe('2025-01-01');
  expect(transaction.searchParams.get('operator_id')).toBe('1');
  expect(within(dialog).getByRole('link', { name: 'B-1 歷程' }).getAttribute('href')).toContain('/inventory/batches/1?start_date=2025-01-01');
});
it.each(['missing', 'mismatch', 'unit'])('聚合%s錯誤顯示重試而不渲染總計', async failure => {
  setup({ overview: true, stock: failure === 'missing' ? [] : failure === 'mismatch' ? [{ ...balances[0], closing: '9.000' }, balances[1]] : balances, items: failure === 'unit' ? [base, { ...base, id: 2, unit: '包' }] : events });
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  expect(screen.queryByRole('table', { name: '食材期間總覽' })).toBeNull();
});
it('深連結刷新及失敗隱藏cached期間公式但保留單筆', async () => {
  const { fetch, client } = setup({ overview: true, detail: base });
  await screen.findByText(/期初 0.000.*期末 1.000/);
  let finish: (value: Response) => void = () => {};
  fetch.mockImplementation(async (url: string) => url.includes('/reports/stock') ? new Promise<Response>(resolve => { finish = resolve; }) : json({ items: events, total: events.length }));
  void client.invalidateQueries({ queryKey: queryKeys.reports.all });
  await screen.findByText('期間統計載入中，暫不顯示期初期末。');
  expect(screen.queryByText(/期初 0.000.*期末 1.000/)).toBeNull();
  expect(screen.getByText('單筆追溯：異動 #1，台北日期 2025-01-06。')).toBeTruthy();
  finish(new Response('{}', { status: 500 }));
  await screen.findByText(/期間統計無法顯示/);
  expect(screen.queryByText(/期初 0.000.*期末 1.000/)).toBeNull();
});
