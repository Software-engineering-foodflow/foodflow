import { useRef, useState } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateStockQueries, queryKeys } from "../../shared/api/queryKeys";
import { useIdempotencyKey } from "../../shared/hooks/useIdempotencyKey";
import * as api from "./api";
export type { WasteBatch, WasteInput, WasteRecord } from "./api";
export const wasteReasons = [
  { value: "EXPIRED", label: "過期" }, { value: "SPOILED", label: "變質" },
  { value: "DAMAGED", label: "損壞" }, { value: "OTHER", label: "其他" },
];
export const reasonLabel = (value: string) => wasteReasons.find(r => r.value === value)?.label ?? value;
export const wasteErrorInfo = api.errorInfo;
export function useWasteBatches(search: string, page: number) {
  return useQuery({ queryKey: queryKeys.waste.batches(search, page),
    queryFn: ({ signal }) => api.listBatches(search, page, signal), staleTime: 0 });
}
export function useWasteBatch(id: number | null) {
  return useQuery({ queryKey: queryKeys.waste.batch(id),
    queryFn: ({ signal }) => api.getBatch(id!, signal), enabled: id !== null, staleTime: 0 });
}
export function useWasteRecords(page: number) {
  return useQuery({ queryKey: queryKeys.waste.records(page),
    queryFn: ({ signal }) => api.listRecords(page, signal) });
}
export function useWastePending() {
  return useIsMutating({ mutationKey: queryKeys.waste.all }) > 0;
}
export function useCreateWaste() {
  const client = useQueryClient();
  return useMutation({ mutationKey: queryKeys.waste.all, mutationFn: api.createWaste, onSuccess: () => invalidateStockQueries(client),
    onError: error => {
      // 衝突後重讀庫存，不改寫已核對的提交快照。
      if (api.errorInfo(error).status === 409) return invalidateStockQueries(client);
    },
  });
}
/** 每次開框複製明確剩餘量；重新查詢不會改寫已核對的提交量。 */
export function useFullWaste() {
  type Snapshot = Pick<api.WasteBatch, "id" | "batch_number" | "ingredient_name" | "unit" | "remaining_quantity">;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [reason, setReason] = useState<api.WasteInput["reason"]>("EXPIRED");
  const [note, setNote] = useState("");
  const [completed, setCompleted] = useState(false);
  const [unresolved, setUnresolved] = useState<Snapshot | null>(null);
  const { key, rotate } = useIdempotencyKey();
  const mutation = useCreateWaste();
  const submitting = useRef(false);
  return {
    snapshot, reason, note, completed, unresolved: unresolved !== null, pending: mutation.isPending, error: api.errorInfo(mutation.error),
    open: (batch: Snapshot) => {
      if (submitting.current) return;
      if (unresolved) { setSnapshot({ ...unresolved }); return; }
      setSnapshot({ ...batch }); setReason("EXPIRED"); setNote(""); setCompleted(false);
      mutation.reset(); rotate();
    },
    close: () => { if (!submitting.current) setSnapshot(null); },
    setReason: (value: api.WasteInput["reason"]) => { if (unresolved) return; setReason(value); rotate(); mutation.reset(); },
    setNote: (value: string) => { if (unresolved) return; setNote(value); rotate(); mutation.reset(); },
    confirm: async () => {
      if (!snapshot || submitting.current) return;
      submitting.current = true;
      try {
        await mutation.mutateAsync({ key, body: { batch_id: snapshot.id,
          quantity: snapshot.remaining_quantity, reason, note: note || null } });
        setUnresolved(null); setCompleted(true); setSnapshot(null); rotate();
      } catch (error) {
        const status = error instanceof Error ? api.errorInfo(error).status : undefined;
        // 只有明確業務拒絕才結束操作；傳輸或伺服器錯誤可能已提交。
        setUnresolved(status !== undefined && status >= 400 && status < 500 ? null : snapshot);
      }
      finally { submitting.current = false; }
    },
  };
}
