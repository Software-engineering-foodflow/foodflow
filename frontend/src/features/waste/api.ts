import { API_PREFIX, ApiError, request } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";
export type WasteInput = components["schemas"]["WasteCreate"];
export type WasteBatch = components["schemas"]["WasteBatchResponse"];
export type WasteRecord = components["schemas"]["AdminWasteResponse"] | components["schemas"]["WasteResponse"];
export const listBatches = (search: string, page: number, signal?: AbortSignal) =>
  request<components["schemas"]["WasteBatchPage"]>(`${API_PREFIX}/waste-records/batches?search=${encodeURIComponent(search)}&page=${page}`, { signal });
export const getBatch = (id: number, signal?: AbortSignal) =>
  request<WasteBatch>(`${API_PREFIX}/waste-records/batches/${id}`, { signal });
export const listRecords = (page: number, signal?: AbortSignal) =>
  request<components["schemas"]["WastePage"]>(`${API_PREFIX}/waste-records?page=${page}`, { signal });
export const createWaste = ({ body, key }: { body: WasteInput; key: string }) =>
  request<WasteRecord>(`${API_PREFIX}/waste-records`, { method: "POST", body, idempotencyKey: key });
export function errorInfo(error: Error | null) {
  return { message: error?.message, status: error instanceof ApiError ? error.status : undefined, fields: error instanceof ApiError ? error.fields : [],
    remaining: error instanceof ApiError ? error.details?.remaining_quantity : undefined };
}
