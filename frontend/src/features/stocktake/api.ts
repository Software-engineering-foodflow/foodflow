import { API_PREFIX, ApiError, request } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type StocktakeBatch = components["schemas"]["StocktakeBatch"];
export type CountInput = components["schemas"]["StocktakePreviewRequest"];
export type ConfirmInput = components["schemas"]["StocktakeConfirmRequest"];
export const listBatches = (search: string, page: number, signal?: AbortSignal) =>
  request<components["schemas"]["StocktakeBatchPage"]>(
    `${API_PREFIX}/stocktakes/batches?search=${encodeURIComponent(search)}&page=${page}`, { signal });
export const preview = (body: CountInput) =>
  request<components["schemas"]["StocktakePreview"]>(`${API_PREFIX}/stocktakes/preview`, { method: "POST", body });
export const confirm = (body: ConfirmInput) =>
  request<components["schemas"]["StocktakeResponse"]>(`${API_PREFIX}/stocktakes`, { method: "POST", body });
export function errorInfo(error: Error | null) {
  return {
    message: error?.message, status: error instanceof ApiError ? error.status : undefined,
    fields: error instanceof ApiError ? error.fields : [],
    current: error instanceof ApiError ? error.details?.current_quantity : undefined,
    batchId: error instanceof ApiError ? error.details?.batch_id : undefined,
  };
}
