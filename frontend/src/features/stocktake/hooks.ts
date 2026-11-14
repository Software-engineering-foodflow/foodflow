import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateStockQueries, queryKeys } from "../../shared/api/queryKeys";
import * as api from "./api";

export type { StocktakeBatch } from "./api";
export const stocktakeErrorInfo = api.errorInfo;
type DraftLine = { batch: api.StocktakeBatch; actual_quantity: string; reason: string;
  reason_kind: "DAILY" | "PERIODIC" | "ANOMALY" | "OTHER"; period: "" | "WEEKLY" | "MONTHLY" | "QUARTERLY"; note: string };

export function useStocktakeBatches(search: string, page: number) {
  return useQuery({
    queryKey: queryKeys.stocktake.batches(search, page),
    queryFn: ({ signal }) => api.listBatches(search, page, signal), staleTime: 0,
  });
}

/** 編輯只保留表單草稿；伺服器預覽與結果由 mutation 管理。 */
export function useStocktake() {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const client = useQueryClient();
  const busy = useRef(false);
  const preview = useMutation({ mutationFn: api.preview });
  const confirm = useMutation({ mutationFn: api.confirm,
    onSuccess: () => invalidateStockQueries(client),
    onError: error => {
      if (api.errorInfo(error).status === 409) return invalidateStockQueries(client);
    },
  });
  const edited = () => { preview.reset(); confirm.reset(); };
  return {
    lines, preview: preview.data, result: confirm.data,
    pending: preview.isPending || confirm.isPending,
    error: api.errorInfo(confirm.error ?? preview.error),
    add: (batch: api.StocktakeBatch) => {
      if (busy.current || lines.some(line => line.batch.id === batch.id) || lines.length >= 100) return;
      edited();
      setLines(current => [...current, { batch, actual_quantity: "", reason: "", reason_kind: "DAILY", period: "", note: "" }]);
    },
    remove: (id: number) => {
      if (busy.current) return;
      edited(); setLines(current => current.filter(line => line.batch.id !== id));
    },
    edit: (id: number, field: "actual_quantity" | "reason" | "reason_kind" | "period" | "note", value: string) => {
      if (busy.current) return;
      edited(); setLines(current => current.map(line => line.batch.id === id ? {
        ...line, [field]: value, ...(field === "reason_kind" ? { period: "" as const } : {}),
      } as DraftLine : line));
    },
    makePreview: async () => {
      if (busy.current || !lines.length) return;
      busy.current = true; preview.reset(); confirm.reset();
      try {
        await preview.mutateAsync({ lines: lines.map(line => ({
          batch_id: line.batch.id, actual_quantity: line.actual_quantity,
          reason: "", reason_kind: line.reason_kind, period: line.period || null, note: line.note || null,
        })) });
      } catch { /* mutation 顯示錯誤，保留輸入。 */ }
      finally { busy.current = false; }
    },
    confirm: async () => {
      if (busy.current || !preview.data) return;
      busy.current = true;
      try {
        await confirm.mutateAsync({ lines: preview.data.lines.map(line => ({
          batch_id: line.batch_id, actual_quantity: line.actual_quantity, reason: line.reason,
          expected_quantity: line.expected_quantity, expected_transaction_id: line.expected_transaction_id,
        })) });
        preview.reset();
        return true;
      } catch (error) {
        if (error instanceof Error && api.errorInfo(error).status === 409) preview.reset();
        return false;
      } finally { busy.current = false; }
    },
  };
}
