import { API_PREFIX, ApiError, request } from "../../shared/api/client";
import type { components } from "../../shared/api/schema";

export type AlertItem = components["schemas"]["AlertItem"];
export type AlertList = components["schemas"]["AlertList"];
export type AlertSetting = components["schemas"]["AlertSettingResponse"];
export type AlertStatus = AlertItem["status"];
export interface AlertFilters { status: AlertStatus | ""; locationId: string }
export function settingFieldError(error: unknown) {
  return error instanceof ApiError ? error.fields.find(field => field.field === "warning_days")?.message : undefined;
}
export function listAlerts(filters: AlertFilters, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.locationId) params.set("location_id", filters.locationId);
  return request<AlertList>(`${API_PREFIX}/alerts?${params}`, { signal });
}
export function getAlertSettings(signal?: AbortSignal) {
  return request<AlertSetting>(`${API_PREFIX}/alert-settings`, { signal });
}
export function updateAlertSettings(warningDays: number) {
  return request<AlertSetting>(`${API_PREFIX}/alert-settings`, { method: "PATCH", body: { warning_days: warningDays } });
}
/** Include inactive locations holding stock and load every API page. */
export async function listAlertLocations(signal?: AbortSignal) {
  type Page = components["schemas"]["StorageLocationList"];
  const items: Page["items"] = [];
  let page = 1;
  while (true) {
    const result = await request<Page>(`${API_PREFIX}/storage-locations?page_size=100&page=${page}`, { signal });
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) return items;
    page++;
  }
}
