import { API_PREFIX, request } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export { ApiError } from "../../shared/api/client";

export type Receipt = components["schemas"]["ReceiptResponse"];
export type Draft = components["schemas"]["ReceiptDraftRequest"];
export type Option = components["schemas"]["ReceiptOption"];
type OptionList = components["schemas"]["ReceiptOptionList"];
export type OptionKind = "suppliers" | "ingredients" | "locations";
const BASE = `${API_PREFIX}/goods-receipts`;

export function getReceipt(id: number, signal?: AbortSignal) {
  return request<Receipt>(`${BASE}/${id}`, { signal });
}
export function saveReceipt({ id, body }: { id?: number; body: Draft }) {
  return request<Receipt>(id ? `${BASE}/${id}` : BASE, { method: id ? "PATCH" : "POST", body });
}
export function confirmReceipt(id: number) {
  return request<Receipt>(`${BASE}/${id}/confirm`, { method: "POST" });
}
export function deleteReceipt(id: number) {
  return request<void>(`${BASE}/${id}`, { method: "DELETE" });
}
/** Read every page so active master data beyond the API's 100-row limit stays selectable. */
export async function getOptions(kind: OptionKind, signal?: AbortSignal, includeInactive = false) {
  const items: Option[] = [];
  let page = 1;
  let total: number;
  do {
    const result = await request<OptionList>(`${BASE}/options/${kind}?page=${page}&page_size=100&include_inactive=${includeInactive}`, { signal });
    items.push(...result.items);
    total = result.total;
    page += 1;
    if (!result.items.length) break;
  } while (items.length < total);
  return items;
}

export type ReceiptFilters = { receipt_number: string; date_from: string; date_to: string;
  supplier_id: string; ingredient_id: string; page: number };
export function listReceipts(filters: ReceiptFilters, signal?: AbortSignal) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value !== "") params.set(key, String(value)); });
  return request<components["schemas"]["ReceiptList"]>(`${BASE}?${params}`, { signal });
}
export function reverseReceipt({ id, reason }: { id: number; reason: string }) {
  return request<Receipt>(`${BASE}/${id}/reverse`, { method: "POST", body: { reason } });
}
