import { Box } from "@mantine/core";
import type { ReactNode } from "react";

import { statusBadgeMap, statusTextWithDays, type BadgeStatus } from "./statusBadgeMap";

interface StatusBadgeProps {
  status: BadgeStatus;
  /** 後端回傳的剩餘天數（days_until_expiry）；文字格式見 statusTextWithDays。 */
  days?: number;
  /** 自訂補充文字，接在狀態詞後面；有 `days` 時忽略。 */
  detail?: ReactNode;
}

/**
 * NFR-01：狀態同時顯示文字與顏色；強度依 statusBadgeMap 的 tone。
 *
 * ```tsx
 * <StatusBadge status="EXPIRED" days={-1} />        // 「過期 1 天」
 * <StatusBadge status="EXPIRING_SOON" days={2} />   // 「即期 · 剩 2 天」
 * <StatusBadge status="NORMAL" days={5} />          // 「剩 5 天」（灰字）
 * ```
 *
 * 天數一律由後端回傳，標籤開頭一定是狀態詞（正常狀態只是弱提示，不加狀態詞）。
 */
export function StatusBadge({ status, days, detail }: StatusBadgeProps) {
  const { label, color, tone } = statusBadgeMap[status];
  const text = days !== undefined
    ? statusTextWithDays(status, days)
    : detail === undefined ? label : <>{label} {detail}</>;
  return (
    <Box component="span" data-status={status} data-tone={tone} style={{
      // 即期與正常不填底，左側不留內距，文字才會跟欄位左緣對齊。
      display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 9999,
      padding: tone === "strong" ? "2px 10px" : "2px 10px 2px 0",
      fontSize: "var(--mantine-font-size-xs)", fontWeight: tone === "weak" ? 500 : 700, lineHeight: 1.4,
      whiteSpace: "nowrap", flexShrink: 0,
      color: tone === "weak" ? "var(--mantine-color-dimmed)" : `var(--mantine-color-${color}-8)`,
      background: tone === "strong" ? `var(--mantine-color-${color}-0)` : "transparent",
    }}>
      {tone !== "weak" && <span data-dot aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />}
      {text}
    </Box>
  );
}
