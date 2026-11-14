import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { allTransactions, type Transaction } from './api';
import { milli, quantity, summarize, taipeiMonth } from './summary';
import { IngredientOverview } from './components/IngredientOverview';
const json = (value: unknown) => new Response(JSON.stringify(value));
const item = (id: number, overrides: Partial<Transaction> = {}): Transaction => ({ id, ingredient_id: 1, ingredient_name: '雞肉', batch_id: id, batch_number: `B-${id}`, unit: '公斤', type: 'RECEIPT', quantity_delta: '0.100', quantity_before: '0.000', quantity_after: '0.100', occurred_at: `2026-11-06T0${id}:00:00Z`, operator_id: 1, operator_name: '人員', reason: "", is_non_fefo: false, source_receipt_id: 1, source_receipt_number: 'GR-1', source_item_id: 1, operation_group_id: 'hidden-uuid', reverses_transaction_id: null, ...overrides });
it('全分頁載入，拒絕總數變化、重複與缺頁，不回傳部分結果', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ items: [item(1)], total: 2 })).mockResolvedValueOnce(json({ items: [item(2)], total: 2 }));
  vi.stubGlobal('fetch', fetch);
  expect(await allTransactions('start_date=2026-11-01')).toHaveLength(2);
  expect(fetch.mock.calls[1][0]).toContain('page=2');
  for (const second of [{ items: [item(2)], total: 3 }, { items: [item(1)], total: 2 }, { items: [], total: 2 }]) {
    fetch.mockReset().mockResolvedValueOnce(json({ items: [item(1)], total: 2 })).mockResolvedValueOnce(json(second));
    await expect(allTransactions('')).rejects.toThrow(/重試/);
  }
  const controller = new AbortController(); controller.abort();
  await expect(allTransactions('', controller.signal)).rejects.toThrow();
});
it('三位精度事件口徑、沖銷不抵損耗、關注排序及台北月界', () => {
  expect(quantity(milli('0.100') + milli('0.200'))).toBe('0.300');
  const rows = summarize([item(1), item(2, { ingredient_id: 2, ingredient_name: '豆', unit: '包', type: 'WASTE', quantity_delta: '-0.200' }), item(3, { ingredient_id: 2, ingredient_name: '豆', unit: '包', type: 'REVERSAL', quantity_delta: '0.200' }), item(4, { type: 'ADJUSTMENT', quantity_delta: '-0.001' })]);
  expect(rows.find(r => r.id === 2)?.loss).toBe(200n);
  expect(rows.find(r => r.id === 1)?.loss).toBe(1n);
  expect(taipeiMonth(new Date('2026-10-31T16:01:00Z'))).toEqual({ start: '2026-11-01', end: '2026-11-01' });
});
it('跨批搜尋保留整個食材彙總、分單位KPI、四類Tabs與ESC關閉保留搜尋', async () => {
  const items = [item(1), item(2, { quantity_delta: '0.200' }), item(3, { type: 'WASTE', quantity_delta: '-0.100' }), item(4, { ingredient_id: 2, ingredient_name: '豆', unit: '包' })];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/reports/stock') ? json([{ ingredient_id: 1, ingredient_name: '雞肉', unit: '公斤', opening: '2.000', receipt: '0.300', issue: '0.000', waste: '0.100', adjustment: '0.000', closing: '2.200' }, { ingredient_id: 2, unit: '包', opening: '0.000', closing: '0.100' }]) : json({ items, total: items.length })));
  render(<MantineProvider env="test"><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><IngredientOverview dates="start_date=2026-11-01&end_date=2026-11-14" enabled filters={new URLSearchParams()} /></MemoryRouter></QueryClientProvider></MantineProvider>);
  await screen.findByText('2 筆 · 0.300 公斤');
  expect(screen.getByText('1 筆 · 0.100 包')).toBeTruthy();
  const search = screen.getByLabelText('搜尋名稱、食材 ID 或批號');
  fireEvent.change(search, { target: { value: 'B-1' } });
  expect(screen.queryByRole('button', { name: '查看 豆 明細' })).toBeNull();
  expect(screen.getByText('2 筆 · 0.300 公斤')).toBeTruthy();
  const open = screen.getByRole('button', { name: '查看 雞肉 明細' }); open.focus(); fireEvent.click(open);
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getAllByRole('tab')).toHaveLength(4);
  expect(within(dialog).getByText(/期初 2.000.*期末 2.200/)).toBeTruthy();
  expect(within(dialog).getAllByRole('link', { name: '查看食材庫存' })).toHaveLength(1);
  expect(within(dialog).queryByText(/hidden-uuid/)).toBeNull();
  fireEvent.click(within(dialog).getByRole('tab', { name: '進貨入庫（2）' }));
  expect(within(dialog).getByText('新到舊排列 · 共 2 筆')).toBeTruthy();
  fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((search as HTMLInputElement).value).toBe('B-1');
});

it('後續頁失敗不顯示局部數量，切換區間載入時隱藏舊數字', async () => {
  let finish: (response: Response) => void = () => {};
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/reports/stock')) return json([{ ingredient_id: 1, unit: '公斤', opening: '0.000', closing: '0.100' }]);
    if (url.includes('2026-10-01')) return new Promise<Response>(resolve => { finish = resolve; });
    return json({ items: [item(1)], total: 1 });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (dates: string) => <MantineProvider env="test"><QueryClientProvider client={client}><MemoryRouter><IngredientOverview dates={dates} enabled filters={new URLSearchParams()} /></MemoryRouter></QueryClientProvider></MantineProvider>;
  const rendered = render(view('start_date=2026-11-01&end_date=2026-11-14'));
  await screen.findByText('1 筆 · 0.100 公斤');
  rendered.rerender(view('start_date=2026-10-01&end_date=2026-10-14'));
  await screen.findByText('載入完整區間中…');
  expect(screen.queryByText('1 筆 · 0.100 公斤')).toBeNull();
  finish(new Response(JSON.stringify({ error: { message: '載入失敗' } }), { status: 500 }));
  await screen.findByRole('alert');
  expect(screen.queryByText('1 筆 · 0.100 公斤')).toBeNull();
});
