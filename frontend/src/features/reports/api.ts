import { API_PREFIX, request } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";
type S = components["schemas"];
export type Transaction = S["TransactionResponse"];
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
