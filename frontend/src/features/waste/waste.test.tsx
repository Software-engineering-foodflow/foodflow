import { useState, type ReactNode } from "react";
import { MantineProvider, Button } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { WasteForm } from "./components/WasteForm";
import { FullWasteDialog } from "./components/FullWasteDialog";
import { WasteRecordsPage } from "./pages/WasteRecordsPage";
import { useFullWaste, type WasteBatch } from "./hooks";
import { queryKeys } from "../../shared/api/queryKeys";

const batch: WasteBatch = { id: 9, batch_number: "B-9", ingredient_id: 1, ingredient_name: "雞肉",
  unit: "公斤", remaining_quantity: "2.000", expiry_date: "2026-11-01", location_name: "冷藏庫",
  source_receipt_id: 1, source_status: "CONFIRMED" };
const record = { id: 1, transaction_id: 4, operation_group_id: "group", batch_id: 9,
  batch_number: "B-9", ingredient_name: "雞肉", unit: "公斤", quantity: "2.000",
  quantity_after: "0.000", reason: "EXPIRED", note: null, operator_id: 1,
  operator_name: "員工", occurred_at: "2026-11-06T00:00:00Z" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = (remaining?: string) => json({ error: { code: "INSUFFICIENT_STOCK",
  message: "可用量不足", details: { remaining_quantity: remaining }, fields: [] } }, 409);
function mount(node: ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<MantineProvider env="test"><QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
  </QueryClientProvider></MantineProvider>);
  return { client, invalidate };
}
function writes(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.filter(([, options]) => options?.method === "POST");
}
function key(call: unknown[]) { return new Headers((call[1] as RequestInit).headers).get("Idempotency-Key"); }

describe("報廢表單", () => {
  it("保留網路失敗輸入與key；重試成功才清空並失效七類查詢", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(json(record));
    vi.stubGlobal("fetch", fetch);
    const { invalidate } = mount(<WasteForm batch={batch} />);
    fireEvent.change(screen.getByRole("textbox", { name: /報廢數量/ }), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("報廢說明"), { target: { value: "過期核對" } });
    fireEvent.click(screen.getByRole("button", { name: "登記報廢" }));
    await screen.findByRole("alert");
    expect((screen.getByRole("textbox", { name: /報廢數量/ }) as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("報廢說明") as HTMLInputElement).value).toBe("過期核對");
    expect(screen.queryByText("報廢已完成")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "登記報廢" }));
    await screen.findByText("報廢已完成");
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/waste-records");
    expect(key(fetch.mock.calls[0])).toBe(key(fetch.mock.calls[1]));
    expect(invalidate.mock.calls.map(c => c[0]?.queryKey?.[0]).sort())
      .toEqual(["alerts", "goods-receipt", "inventory", "issue", "reports", "stocktake", "waste"]);
    expect((screen.getByRole("textbox", { name: /報廢數量/ }) as HTMLInputElement).value).toBe("");
  });
  it("修改內容換key；pending不重複送出；顯示欄位錯誤", async () => {
    let resolve: (r: Response) => void = () => {};
    const fetch = vi.fn().mockImplementationOnce(() => Promise.resolve(json({ error: {
      code: "RULE_VIOLATION", message: "請修正", details: {}, fields: [{ field: "quantity", message: "數量須為正數" }],
    } }, 422))).mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
    vi.stubGlobal("fetch", fetch);
    mount(<WasteForm batch={batch} />);
    fireEvent.change(screen.getByRole("textbox", { name: /報廢數量/ }), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "登記報廢" }));
    await screen.findByText("數量須為正數");
    fireEvent.change(screen.getByRole("textbox", { name: /報廢數量/ }), { target: { value: "1" } });
    const submit = screen.getByRole("button", { name: "登記報廢" });
    fireEvent.click(submit); fireEvent.click(submit);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(key(fetch.mock.calls[0])).not.toBe(key(fetch.mock.calls[1]));
    resolve(json(record));
    await screen.findByText("報廢已完成");
  });
  it("URL預選批次由真API載入，清單空資料如實顯示", async () => {
    const fetch = vi.fn(async (url: string) => url.endsWith("/batches/9") ? json(batch)
      : json({ items: [], total: 0, page: 1, page_size: 20 }));
    vi.stubGlobal("fetch", fetch);
    mount(<WasteRecordsPage />, "/waste-records/new?batch_id=9");
    await screen.findByRole("textbox", { name: /報廢數量/ });
    expect(fetch.mock.calls.some(c => c[0] === "/api/v1/waste-records/batches/9")).toBe(true);
    expect(await screen.findByText("尚無報廢紀錄。")).toBeTruthy();
  });
});

function FullHarness() {
  const [latest, setLatest] = useState(batch);
  const state = useFullWaste();
  return <><Button onClick={() => state.open(latest)}>開啟全數報廢</Button>
    <Button onClick={() => setLatest({ ...batch, remaining_quantity: "1.000" })}>模擬新餘量</Button>
    <FullWasteDialog state={state} /></>;
}
it("全數報廢固定開框快照；409後重開才用新量與新key", async () => {
  const fetch = vi.fn().mockImplementationOnce(() => Promise.resolve(failure("1.000")))
    .mockResolvedValue(json(record));
  vi.stubGlobal("fetch", fetch);
  mount(<FullHarness />);
  fireEvent.click(screen.getByText("開啟全數報廢"));
  expect((screen.getByRole("combobox", { name: "全數報廢原因" }) as HTMLInputElement).value).toBe("過期");
  fireEvent.click(screen.getByText("模擬新餘量"));
  fireEvent.click(screen.getByRole("button", { name: "確認報廢" }));
  await screen.findByText(/最新剩餘量：1.000/);
  expect(JSON.parse(writes(fetch)[0][1].body).quantity).toBe("2.000");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  fireEvent.click(screen.getByText("開啟全數報廢"));
  fireEvent.click(screen.getByRole("button", { name: "確認報廢" }));
  await waitFor(() => expect(writes(fetch)).toHaveLength(2));
  expect(JSON.parse(writes(fetch)[1][1].body).quantity).toBe("1.000");
  expect(key(writes(fetch)[0])).not.toBe(key(writes(fetch)[1]));
});

it("一般員工清單不出現金額", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => json({
    items: url.includes("batches") ? [] : [record], total: 1, page: 1, page_size: 20,
  })));
  const { client } = mount(<WasteRecordsPage />);
  client.setQueryData(queryKeys.auth.all, { role: "STAFF" });
  await screen.findByText("查看異動 #4");
  expect(screen.queryByText(/損失金額/)).toBeNull();
});


it("全數報廢衝突後實際頁面重讀批次，重開使用最新量", async () => {
  let latest = batch;
  let submissions = 0;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      submissions++;
      if (submissions === 1) {
        latest = { ...batch, remaining_quantity: "1.000" };
        return failure("1.000");
      }
      return json(record);
    }
    if (url === "/api/v1/waste-records/batches/9") return json(latest);
    return json({ items: [], total: 0, page: 1, page_size: 20 });
  });
  vi.stubGlobal("fetch", fetch);
  mount(<WasteRecordsPage />, "/waste-records/new?batch_id=9");
  fireEvent.click(await screen.findByRole("button", { name: "全數報廢" }));
  fireEvent.click(screen.getByRole("button", { name: "確認報廢" }));
  await screen.findByText(/最新剩餘量：1.000/);
  expect(screen.getByText("本次核對數量：2.000 公斤")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  fireEvent.click(screen.getByRole("button", { name: "全數報廢" }));
  expect(screen.getByText("本次核對數量：1.000 公斤")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "確認報廢" }));
  await screen.findByText("全數報廢已完成");
  const calls = writes(fetch);
  expect(JSON.parse(calls[0][1]!.body as string).quantity).toBe("2.000");
  expect(JSON.parse(calls[1][1]!.body as string).quantity).toBe("1.000");
  expect(key(calls[0])).not.toBe(key(calls[1]));
});


it("報廢送出期間禁止切換批次與另開全數報廢", async () => {
  let finish: (response: Response) => void = () => {};
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") return new Promise<Response>(resolve => { finish = resolve; });
    if (url === "/api/v1/waste-records/batches/9") return json(batch);
    return json({ items: url.includes("/batches?") ? [batch, { ...batch, id: 10, batch_number: "B-10" }] : [],
      total: 2, page: 1, page_size: 20 });
  });
  vi.stubGlobal("fetch", fetch);
  mount(<WasteRecordsPage />, "/waste-records/new?batch_id=9");
  const quantity = await screen.findByRole("textbox", { name: /報廢數量/ });
  fireEvent.change(quantity, { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "登記報廢" }));
  const switchBatch = screen.getByRole("button", { name: "選擇 B-10" });
  await waitFor(() => expect((switchBatch as HTMLButtonElement).disabled).toBe(true));
  expect((screen.getByRole("button", { name: "全數報廢" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(switchBatch);
  expect((quantity as HTMLInputElement).value).toBe("1");
  expect(writes(fetch)).toHaveLength(1);
  finish(json(record));
  await screen.findByText("報廢已完成");
  await waitFor(() => expect((switchBatch as HTMLButtonElement).disabled).toBe(false));
});


it("全數報廢結果未知時關框重開仍重試原快照與key", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(json(record));
  vi.stubGlobal("fetch", fetch);
  mount(<FullHarness />);
  fireEvent.click(screen.getByText("開啟全數報廢"));
  fireEvent.click(screen.getByRole("button", { name: "確認報廢" }));
  await screen.findByText("上次報廢結果尚未確認，請先重試同筆操作；原數量與原因會保留。");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  fireEvent.click(screen.getByText("模擬新餘量"));
  fireEvent.click(screen.getByText("開啟全數報廢"));
  expect(screen.getByText("本次核對數量：2.000 公斤")).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "全數報廢原因" }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "確認報廢" }));
  await waitFor(() => expect(writes(fetch)).toHaveLength(2));
  expect(key(writes(fetch)[0])).toBe(key(writes(fetch)[1]));
  expect(JSON.parse(writes(fetch)[0][1].body)).toEqual(JSON.parse(writes(fetch)[1][1].body));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
