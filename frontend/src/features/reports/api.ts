import { API_PREFIX, request } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";
type S = components["schemas"];
export type Transaction = S["TransactionResponse"];
export type StockRow = S["StockReportRow"];
export async function allTransactions(params: string, signal?: AbortSignal): Promise<Transaction[]> {
  const query = new URLSearchParams(params);
  query.set("page_size", "100");
  const items: Transaction[] = [];
  const ids = new Set<number>();
  let expected: number | undefined;
  for (let page = 1; ; page++) {
    signal?.throwIfAborted();
    query.set("page", String(page));
    const result = await transactions(query.toString(), signal);
    signal?.throwIfAborted();
    expected ??= result.total;
    if (result.total !== expected || result.items.some(item => ids.has(item.id)))
      throw new Error("異動資料在載入期間變更，請重試。");
    for (const item of result.items) {
      if (ids.has(item.id)) throw new Error("異動資料重複，請重試。");
      ids.add(item.id); items.push(item);
    }
    if (items.length === expected) return items;
    if (!result.items.length || items.length > expected) throw new Error("異動資料不完整，請重試。");
  }
}
export const transactions = (params: string, signal?: AbortSignal) =>
  request<S["TransactionPage"]>(`${API_PREFIX}/inventory-transactions?${params}`, { signal });
export const transaction = (id: string, signal?: AbortSignal) =>
  request<Transaction>(`${API_PREFIX}/inventory-transactions/${id}`, { signal });
export const locations = (params: string, signal?: AbortSignal) =>
  request<S["LocationPage"]>(`${API_PREFIX}/batch-location-changes?${params}`, { signal });
export const stock = (params: string, signal?: AbortSignal) =>
  request<S["StockReportRow"][]>(`${API_PREFIX}/reports/stock?${params}`, { signal });
export const waste = (params: string, signal?: AbortSignal) =>
  request<S["WasteReportGroup"][]>(`${API_PREFIX}/reports/waste?${params}`, { signal });
