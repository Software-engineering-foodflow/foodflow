import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { routes } from "../shared/routes";
import { renderApp } from "../test/renderApp";

const placeholders = [
  [routes.home, "預警首頁", "謝文佳", "FR-12、FR-13、FR-14"],

  [routes.issues, "領用", "黃予岑 Ken", "FR-10、FR-11"],
  [routes.wasteRecords, "報廢", "郭明儒", "FR-15"],
  [routes.stocktakes, "盤點", "郭明儒", "FR-16"],
  [routes.reports, "異動與統計", "郭明儒", "FR-17、FR-18"],
  [routes.ingredients, "食材", "謝文佳", "FR-03"],
  [routes.ingredientCategories, "分類", "謝文佳", "FR-03"],
  [routes.suppliers, "供應商", "謝文佳", "FR-04"],
] as const;

describe("router", () => {
  it.each(placeholders)("mounts %s as the %s placeholder", async (path, title, owner, fr) => {
    renderApp(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.getByText(`此功能由 ${owner} 負責，開發中`)).toBeTruthy();
    expect(screen.getByText(`對應需求：${fr}`)).toBeTruthy();
  });

  it("keeps the backend status below the alerts placeholder", async () => {
    renderApp(routes.home);
    expect(await screen.findByText("後端正常")).toBeTruthy();
    const heading = screen.getByRole("heading", { level: 1, name: "預警首頁" });
    const status = screen.getByRole("heading", { name: "系統狀態" });
    expect(heading.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ["/issues/new?ingredient_id=5", "領用"],
    ["/waste-records/new?batch_id=9", "報廢"],
    ["/goods-receipts/new?ingredient_id=5", "進貨"],
  ])("lands alert action %s on the %s page and marks it active", async (path, title) => {
    renderApp(path);
    expect(await screen.findByRole("heading", { level: 1, name: title === "進貨" ? "新增進貨草稿" : title })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "主要導覽" });
    expect(within(nav).getByRole("link", { name: title }).getAttribute("aria-current")).toBe("page");
  });

  it("keeps the app frame for unknown paths", async () => {
    renderApp("/no-such-page");
    expect(await screen.findByText("找不到頁面")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "主要導覽" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "登出" })).toBeTruthy();
  });

  it("mounts the inventory query with readonly filters", async () => {
    renderApp(routes.inventory);
    expect(await screen.findByRole("heading", { level: 1, name: "庫存" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "食材名稱" })).toBeTruthy();
    expect(screen.getByText(/低庫存依全店可用量判定/)).toBeTruthy();
  });

  it("still mounts the employee page", async () => {
    renderApp(routes.employees);
    expect(await screen.findByRole("heading", { level: 1, name: "員工帳號" })).toBeTruthy();
  });

  it("mounts the goods receipt entry with draft creation and known-number navigation", async () => {
    renderApp(routes.goodsReceipts);
    expect(await screen.findByRole("heading", { level: 1, name: "進貨" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "建立進貨草稿" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "開啟進貨單" })).toBeTruthy();
  });
});
