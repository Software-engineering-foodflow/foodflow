import { API_PREFIX, request } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type Stock = components["schemas"]["InventoryStock"];
export type Batch = components["schemas"]["InventoryBatchResponse"];
export type Transaction = components["schemas"]["InventoryTransactionResponse"];
export type LocationChange = components["schemas"]["InventoryLocationChange"];
export type Option = components["schemas"]["InventoryOptionResponse"];
export type Filters = { search: string; category_id: string; storage_method: string; location_id: string; status: string; page: number };
export type BatchFilters = { location_id: string; page: number };
const BASE = `${API_PREFIX}/inventory`;

function query(filters: object) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value !== "") params.set(key, String(value)); });
  return params.toString();
}
export function overview(filters: Filters, signal?: AbortSignal) {
  return request<components["schemas"]["InventoryList"]>(`${BASE}?${query(filters)}`, { signal });
}
export function batches(id: string, filters: BatchFilters, signal?: AbortSignal) {
  return request<components["schemas"]["InventoryBatchList"]>(`${BASE}/${id}/batches?${query(filters)}`, { signal });
}
export function batch(id: string, signal?: AbortSignal) {
  return request<Batch>(`${BASE}/batches/${id}`, { signal });
}
export function transactions(id: string, page: number, signal?: AbortSignal) {
  return request<components["schemas"]["InventoryTransactionList"]>(`${BASE}/batches/${id}/transactions?page=${page}`, { signal });
}
export function locationChanges(id: string, page: number, signal?: AbortSignal) {
  return request<components["schemas"]["InventoryLocationChangeList"]>(`${BASE}/batches/${id}/location-changes?page=${page}`, { signal });
}
export async function options(kind: "categories" | "locations", signal?: AbortSignal) {
  const items: Option[] = [];
  let page = 1;
  let total: number;
  do {
    const result = await request<components["schemas"]["InventoryOptionList"]>(`${BASE}/options/${kind}?page=${page}&page_size=100`, { signal });
    items.push(...result.items);
    total = result.total;
    page += 1;
    if (!result.items.length) break;
  } while (items.length < total);
  return items;
}
