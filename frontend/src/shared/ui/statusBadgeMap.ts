/**
 * AD-23：狀態的顯示文字、色票與視覺強度只定義在這裡（DESIGN.md › 狀態色）。
 * - strong：實心底色膠囊加圓點（過期、今日到期、低庫存）
 * - medium：只有圓點加文字（即期）
 * - weak：灰字，不加圓點（正常）
 */

export type BadgeTone = "strong" | "medium" | "weak";

export const statusBadgeMap = {
  EXPIRED: { label: "過期", color: "expired", tone: "strong" },
  EXPIRES_TODAY: { label: "今日到期", color: "today", tone: "strong" },
  EXPIRING_SOON: { label: "即期", color: "soon", tone: "medium" },
  LOW_STOCK: { label: "低庫存", color: "lowStock", tone: "strong" },
  NORMAL: { label: "正常", color: "normal", tone: "weak" },
} as const satisfies Record<string, { label: string; color: string; tone: BadgeTone }>;

export type BadgeStatus = keyof typeof statusBadgeMap;

/**
 * 帶剩餘天數的標籤文字（DESIGN.md › 狀態標籤）。`days` 一律是後端回傳的 days_until_expiry，
 * 前端不自己算。開頭一定是狀態詞；正常狀態只是弱提示，不加狀態詞。
 */
export function statusTextWithDays(status: BadgeStatus, days: number): string {
  switch (status) {
    case "EXPIRED": return `過期 ${-days} 天`;
    case "EXPIRES_TODAY": return statusBadgeMap.EXPIRES_TODAY.label;
    case "EXPIRING_SOON": return `即期 · 剩 ${days} 天`;
    case "NORMAL": return `剩 ${days} 天`;
    default: return statusBadgeMap[status].label;
  }
}
