import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { routes } from "../shared/routes";
import { renderApp } from "../test/renderApp";

describe("router", () => {
  it.each([[routes.wasteRecords, "報廢"], [routes.reports, "異動與統計"], [routes.stocktakes, "盤點"]])("mounts implemented %s", async (path, title) => {
    renderApp(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.queryByText("此功能由 郭明儒 負責，開發中")).toBeNull();
  });
  it.each([
    [routes.ingredients, "食材管理", "新增食材"],
    [routes.ingredientCategories, "食材分類", "新增分類"],
    [routes.suppliers, "供應商", "新增供應商"],
  ])("mounts %s as a working master data page", async (path, title, action) => {
    renderApp(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: action })).toBeTruthy();
    expect(screen.queryByText("功能開發中")).toBeNull();
  });

  it("mounts the working alerts home with server filters", async () => {
    renderApp(routes.home);
    expect(await screen.findByRole("heading", { level: 1, name: "預警首頁" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "預警狀態" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "儲存位置" })).toBeTruthy();
    expect(screen.queryByText("功能開發中")).toBeNull();
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
