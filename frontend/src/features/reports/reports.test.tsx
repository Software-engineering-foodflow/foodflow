import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { ReportsPage } from "./pages/ReportsPage";
import { queryKeys } from "../../shared/api/queryKeys";
const json = (body: unknown) => new Response(JSON.stringify(body));
it("空查詢下清除未套用篩選會重設全部輸入", async () => {
  mount("STAFF");
  await screen.findByText("此期間沒有庫存統計資料。");
  fireEvent.click(screen.getByRole("button", { name: "清除篩選" }));
  await waitFor(() => expect((screen.getByLabelText("起日") as HTMLInputElement).value).toBe(""));
  for (const label of ["起日", "迄日"]) fireEvent.change(screen.getByLabelText(label), { target: { value: "2026-11-14" } });
  for (const label of ["食材編號", "批次編號", "操作者編號"]) fireEvent.change(screen.getByLabelText(label), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("combobox", { name: "異動類型" }));
  fireEvent.click(await screen.findByRole("option", { name: "報廢" }));
  fireEvent.click(screen.getByRole("button", { name: "清除篩選" }));
  for (const label of ["起日", "迄日", "食材編號", "批次編號", "操作者編號"])
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
  expect((screen.getByRole("combobox", { name: "異動類型" }) as HTMLInputElement).value).toBe("");
});
function mount(role: string, groups?: unknown[], total = 0) {
  const employee = { id: 1, role, name: "員工" };
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/me")) return json(employee);
    if (url.includes("/reports/waste")) return json(groups ?? [{ key: "1", label: "雞肉", unit: "公斤",
      quantity: "-2.000", known_loss_amount: "-240.00", unknown_cost_count: 0,
      details: [{ waste_record_id: 1, transaction_id: 3, reverses_transaction_id: 2, batch_id: 9,
        batch_number: "B-9", ingredient_name: "雞肉", quantity: "-2.000", loss_amount: "-240.00",
        reason: "EXPIRED", note: null, occurred_at: "2026-11-06T00:00:00Z", operator_name: "員工" }] }]);
    if (url.includes("/reports/stock")) return json([]);
    return json({ items: [], total, page: 1, page_size: 20 });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.auth.all, employee);
  render(<MantineProvider env="test"><QueryClientProvider client={client}><MemoryRouter
    initialEntries={["/reports?start_date=2026-11-06&end_date=2026-11-06&batch_id=9"]}>
    <ReportsPage />
  </MemoryRouter></QueryClientProvider></MantineProvider>);
  return fetch;
}
it("員工能查統計但不請求報廢分布，總覽載入完整日期區間", async () => {
  const fetch = mount("STAFF");
  await screen.findByText("此期間沒有庫存統計資料。");
  expect(screen.queryByRole("heading", { name: "報廢分布" })).toBeNull();
  expect(fetch.mock.calls.some(c => c[0].includes("/reports/waste"))).toBe(false);
  fireEvent.change(screen.getByLabelText("食材編號"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("操作者編號"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("combobox", { name: "異動類型" }));
  fireEvent.click(await screen.findByRole("option", { name: "報廢" }));
  fireEvent.click(screen.getByRole("button", { name: "套用篩選與日期統計" }));
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.startsWith("/api/v1/inventory-transactions?")
    && !url.includes("ingredient_id=") && !url.includes("operator_id=")
    && !url.includes("batch_id=") && !url.includes("type=")
    && url.includes("start_date=2026-11-06") && url.includes("end_date=2026-11-06"))).toBe(true));
});
it("管理者展開負數沖銷明細與原異動連結", async () => {
  const fetch = mount("ADMIN");
  const row = await screen.findByRole("button", { name: /雞肉.*-2.000/ });
  expect(fetch.mock.calls.every(([url]) => url.startsWith("/api/v1/"))).toBe(true);
  fireEvent.click(row);
  expect(await screen.findByRole("link", { name: /原異動 #2/ })).toBeTruthy();
  expect(screen.getByText(/未知成本事件數包含報廢及沖銷事件/)).toBeTruthy();
});


it("分組鍵與單位的字串串接碰撞不會連動展開", async () => {
  const common = { quantity: "2.000", known_loss_amount: "0.00", unknown_cost_count: 0, details: [] };
  mount("ADMIN", [{ ...common, key: "1", unit: "2kg", label: "第一組" },
    { ...common, key: "12", unit: "kg", label: "第二組" }]);
  const first = await screen.findByRole("button", { name: /第一組/ });
  const second = screen.getByRole("button", { name: /第二組/ });
  fireEvent.click(first);
  expect(first.getAttribute("aria-expanded")).toBe("true");
  expect(second.getAttribute("aria-expanded")).toBe("false");
});

it("總覽搜尋不清除未套用篩選，也不重設位置頁", async () => {
  const fetch = mount("STAFF", undefined, 60);
  await screen.findByText("此期間沒有庫存統計資料。");
  const locations = screen.getByRole("navigation", { name: "位置變更分頁" });
  fireEvent.click(within(locations).getByText("2"));
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes("/batch-location-changes?") && url.includes("page=2"))).toBe(true));
  fireEvent.change(screen.getByLabelText("食材編號"), { target: { value: "123" } });
  fireEvent.change(screen.getByLabelText("搜尋名稱、食材 ID 或批號"), { target: { value: "雞" } });
  expect((screen.getByLabelText("食材編號") as HTMLInputElement).value).toBe("123");
  expect(within(screen.getByRole("navigation", { name: "位置變更分頁" })).getByText("2").closest("button")?.getAttribute("aria-current")).toBe("page");
});
