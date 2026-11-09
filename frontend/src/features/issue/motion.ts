import type { CSSProperties } from "react";

export { default as motion } from "./issue.module.css";

/** 清單項目依序進場，最多延遲到第 10 個，避免長清單等太久（與儲存位置頁相同）。 */
export const stagger = (index: number, base = 0): CSSProperties =>
  ({ "--delay": `${base + Math.min(index, 10) * 70}ms` }) as CSSProperties;
