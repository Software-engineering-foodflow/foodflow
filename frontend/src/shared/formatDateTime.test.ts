import { expect, it } from "vitest";
import { formatDateTime } from "./formatDateTime";

it("台北午夜前後與含時區輸入顯示同一業務日期", () => {
  expect(formatDateTime("2026-11-06T15:59:59Z").replace(/\s/g, " ")).toBe("2026/11/06 23:59:59（台北）");
  expect(formatDateTime("2026-11-06T16:00:00Z").replace(/\s/g, " ")).toBe("2026/11/07 00:00:00（台北）");
  expect(formatDateTime("2026-11-07T00:00:00+08:00")).toBe(formatDateTime("2026-11-06T16:00:00Z"));
});
