import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateStockQueries, queryKeys } from "../../shared/api/queryKeys";
import * as api from "./api";
export type { AlertFilters, AlertItem, AlertStatus } from "./api";
export { settingFieldError } from "./api";
export function useAlerts(filters: api.AlertFilters) {
  return useQuery({ queryKey: queryKeys.alerts.list(filters), queryFn: ({ signal }) => api.listAlerts(filters, signal), staleTime: 0 });
}
export function useAlertLocations() {
  return useQuery({ queryKey: queryKeys.alerts.locations, queryFn: ({ signal }) => api.listAlertLocations(signal), staleTime: 0 });
}
export function useAlertSettings(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.alerts.settings, queryFn: ({ signal }) => api.getAlertSettings(signal), enabled, staleTime: 0 });
}
export function useUpdateAlertSettings() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.updateAlertSettings, onSuccess: () => invalidateStockQueries(client) });
}
