import type { Transaction } from './hooks';

// Integer thousandths avoid binary floating-point drift in event summaries.
export function milli(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new Error('數量格式錯誤');
  return (match[1] ? -1n : 1n) * (BigInt(match[2]) * 1000n + BigInt((match[3] ?? '').padEnd(3, '0')));
}
export function quantity(value: bigint): string {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${abs / 1000n}.${String(abs % 1000n).padStart(3, '0')}`;
}
export function summarize(items: Transaction[]) {
  const groups = new Map<number, { id: number; name: string; unit: string; items: Transaction[]; receipts: bigint; receiptCount: number; loss: bigint; issued: bigint; wasted: bigint; shortage: bigint; attention: boolean }>();
  for (const t of items) {
    const row = groups.get(t.ingredient_id) ?? { id: t.ingredient_id, name: t.ingredient_name, unit: t.unit, items: [], receipts: 0n, receiptCount: 0, loss: 0n, issued: 0n, wasted: 0n, shortage: 0n, attention: false };
    if (row.unit !== t.unit) throw new Error('同食材單位不一致，請重試。');
    row.items.push(t);
    const delta = milli(t.quantity_delta);
    if (t.type === 'RECEIPT') { row.receipts += delta; row.receiptCount++; }
    if (t.type === 'ISSUE') row.issued += delta < 0n ? -delta : delta;
    if (t.type === 'WASTE') row.wasted += delta < 0n ? -delta : delta;
    if (t.type === 'ADJUSTMENT' && delta < 0n) row.shortage -= delta;
    if (t.type === 'WASTE' || (t.type === 'ADJUSTMENT' && delta < 0n)) { row.loss += delta < 0n ? -delta : delta; row.attention = true; }
    if (t.is_non_fefo) row.attention = true;
    groups.set(row.id, row);
  }
  return [...groups.values()].sort((a, b) => Number(b.attention) - Number(a.attention) || a.name.localeCompare(b.name, 'zh-Hant'));
}
export function taipeiMonth(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

export function validPeriod(start: string, end: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  return valid(start) && valid(end) && start <= end;
}

export function reconcile(items: Transaction[], stock: { ingredient_id: number; unit: string; opening: string; closing: string }[]) {
  const rows = summarize(items);
  for (const row of rows) {
    const balance = stock.find(b => b.ingredient_id === row.id);
    if (!balance || balance.unit !== row.unit || row.items.reduce((sum, t) => sum + milli(t.quantity_delta), 0n) !== milli(balance.closing) - milli(balance.opening))
      throw new Error('資料更新中，異動與庫存統計不一致，請重試。');
  }
  for (const balance of stock) {
    if (!rows.some(row => row.id === balance.ingredient_id) && milli(balance.closing) !== milli(balance.opening))
      throw new Error('資料更新中，異動與庫存統計不一致，請重試。');
  }
  return rows;
}
export function reportLink(context: URLSearchParams, key: 'batch_id' | 'transaction_id', id: number) {
  const next = new URLSearchParams(context);
  next.set(key, String(id));
  if (key === 'batch_id') next.delete('transaction_id');
  return `/reports?${next}`;
}
