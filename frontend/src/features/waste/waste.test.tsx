import { useState, type ReactNode } from "react";
import { MantineProvider, Button } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
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

function HistoryControls() {
  const navigate = useNavigate();
  return <Button onClick={() => navigate(-1)}>瀏覽器返回</Button>;
}

function pageFetch() {
  const application = { ...record, status: "PENDING", transaction_id: null, record_id: null,
    location_name: "冷藏庫", reviewer_name: null, reviewed_at: null, rejection_reason: null };
  return vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") return json(application);
    if (url === "/api/v1/auth/me") return json({ id: 1, role: "ADMIN", name: "管理者" });
    if (url.endsWith("/batches/9")) return json(batch);
    return json({ items: url.includes("/requests?") ? [application] : url.includes("/batches?") ? [batch] : [], total: url.includes("/requests?") ? 40 : 0,
      page: url.endsWith("page=2") ? 2 : 1, page_size: 20 });
  });
}

it.each(["approve", "reject"] as const)("%s 成功關框並重新顯示審核結果", async action => {
  let application = { ...record, status: "PENDING", transaction_id: null as number | null,
    record_id: null as number | null, location_name: "冷藏庫", reviewer_name: null as string | null,
    reviewed_at: null as string | null, rejection_reason: null as string | null };
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      application = { ...application, status: action === "approve" ? "APPROVED" : "REJECTED",
        reviewer_name: "審核管理員", reviewed_at: "2026-11-14T00:00:00Z",
        transaction_id: action === "approve" ? 4 : null, record_id: action === "approve" ? 1 : null,
        rejection_reason: action === "reject" ? JSON.parse(options.body as string).reason : null };
      return json(application);
    }
    if (url.endsWith("/auth/me")) return json({ id: 1, role: "ADMIN", name: "管理者" });
    return json({ items: url.includes("/requests?") ? [application] : [], total: 1, page: 1, page_size: 20 });
  });
  vi.stubGlobal("fetch", fetch);
  mount(<WasteRecordsPage />);
  fireEvent.click(await screen.findByRole("button", { name: action === "approve" ? "核准申請 #1" : "駁回申請 #1" }));
  if (action === "reject") fireEvent.change(screen.getByRole("textbox", { name: "駁回原因（必填）" }), { target: { value: "數量有誤" } });
  fireEvent.click(screen.getByRole("button", { name: action === "approve" ? "核准並報廢" : "確認駁回" }));
  await screen.findByText(action === "approve" ? "已核准" : "已駁回");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText(/審核：審核管理員/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "核准申請 #1" })).toBeNull();
  expect(screen.queryByRole("button", { name: "駁回申請 #1" })).toBeNull();
  expect(writes(fetch)[0][0]).toBe(`/api/v1/waste-records/requests/1/${action}`);
  if (action === "approve") expect(screen.getByRole("link", { name: "查看異動 #4" }).getAttribute("href")).toContain("transaction_id=4");
  else {
    expect(screen.getByText(/駁回原因：數量有誤/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /查看異動/ })).toBeNull();
  }
});

it("普通申請結果未知時關框重開保留原內容與key並禁止另送全數", async () => {
  const fallback = pageFetch();
  let submissions = 0;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST" && ++submissions === 1) throw new TypeError("response lost");
    return fallback(url, options);
  });
  vi.stubGlobal("fetch", fetch);
  mount(<WasteRecordsPage />, "/waste-records?batch_id=9");
  fireEvent.change(await screen.findByRole("textbox", { name: "報廢數量" }), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("報廢說明"), { target: { value: "核對過期" } });
  fireEvent.click(screen.getByRole("button", { name: "送出審核" }));
  await screen.findByText(/上次報廢結果尚未確認/);
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "新增報廢申請" }));
  const quantity = await screen.findByRole("textbox", { name: "報廢數量" }) as HTMLInputElement;
  expect(quantity.value).toBe("1");
  expect(quantity.disabled).toBe(true);
  expect((screen.getByRole("button", { name: "移除批次" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "全數報廢申請" }) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect((screen.getByRole("button", { name: "送出審核" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "送出審核" }));
  await screen.findByText("報廢申請已送出，待管理員審核。");
  expect(writes(fetch)).toHaveLength(2);
  expect(key(writes(fetch)[0])).toBe(key(writes(fetch)[1]));
  expect(writes(fetch)[0][1]?.body).toBe(writes(fetch)[1][1]?.body);
});

it.each(["normal", "full"])("%s 申請成功返回申請第一頁", async kind => {
  const fetch = pageFetch();
  vi.stubGlobal("fetch", fetch);
  mount(<WasteRecordsPage />);
  const pageTwo = await screen.findByRole("button", { name: "2" });
  fireEvent.click(pageTwo);
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.endsWith("requests?page=2"))).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "新增報廢申請" }));
  fireEvent.click(await screen.findByRole("button", { name: "選擇 B-9" }));
  await screen.findByRole("textbox", { name: "報廢數量" });
  if (kind === "full") {
    fireEvent.click(screen.getByRole("button", { name: "全數報廢申請" }));
    fireEvent.click(screen.getByRole("button", { name: "送出全數報廢審核" }));
  } else {
    fireEvent.change(screen.getByRole("textbox", { name: "報廢數量" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "送出審核" }));
  }
  await screen.findByText("報廢申請已送出，待管理員審核。");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-current")).toBeNull();
  expect(screen.getAllByRole("button", { name: "1" }).every(button => button.getAttribute("aria-current") === "page")).toBe(true);
});

it("全數申請成功後外層彈窗關閉且成功訊息可見", async () => {
  vi.stubGlobal("fetch", pageFetch());
  mount(<WasteRecordsPage />, "/waste-records?batch_id=9");
  fireEvent.click(await screen.findByRole("button", { name: "全數報廢申請" }));
  fireEvent.click(screen.getByRole("button", { name: "送出全數報廢審核" }));
  await screen.findByText("報廢申請已送出，待管理員審核。");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("取消指定批次後瀏覽器返回會重新開啟申請", async () => {
  vi.stubGlobal("fetch", pageFetch());
  mount(<><HistoryControls /><WasteRecordsPage /></>, "/waste-records?batch_id=9");
  await screen.findByRole("textbox", { name: "報廢數量" });
  fireEvent.click(screen.getAllByRole("button", { name: "取消" }).at(-1)!);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "瀏覽器返回" }));
  expect(await screen.findByRole("textbox", { name: "報廢數量" })).toBeTruthy();
});

it("核准庫存不足顯示伺服器最新剩餘量", async () => {
  const fallback = pageFetch();
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) =>
    options?.method === "POST" ? Promise.resolve(failure("0.500")) : fallback(url, options)));
  mount(<WasteRecordsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "核准申請 #1" }));
  fireEvent.click(screen.getByRole("button", { name: "核准並報廢" }));
  expect(await screen.findByText(/最新剩餘量：0.500/)).toBeTruthy();
});

it("待審核申請沒有異動連結；管理員駁回必填原因且失敗保留輸入", async () => {
  const request = { ...record, status: "PENDING", transaction_id: null, record_id: null,
    location_name: "冷藏庫", reviewer_name: null, reviewed_at: null, rejection_reason: null };
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") return json({ error: {
      code: "STATE_CONFLICT", message: "申請狀態已改變", fields: [], details: {},
    } }, 409);
    if (url === "/api/v1/auth/me") return json({ id: 1, role: "ADMIN", name: "管理者" });
    return json({ items: url.includes("/requests?") ? [request] : [], total: 1, page: 1, page_size: 20 });
  });
  vi.stubGlobal("fetch", fetch);
  mount(<WasteRecordsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "駁回申請 #1" }));
  expect(screen.queryByText(/查看異動/)).toBeNull();
  const submit = screen.getByRole("button", { name: "確認駁回" });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "駁回原因（必填）" }), { target: { value: "先核對" } });
  fireEvent.click(submit);
  await screen.findByText("申請狀態已改變");
  expect((screen.getByRole("textbox", { name: "駁回原因（必填）" }) as HTMLInputElement).value).toBe("先核對");
  expect(writes(fetch)[0][0]).toBe("/api/v1/waste-records/requests/1/reject");
  expect(JSON.parse(writes(fetch)[0][1]!.body as string)).toEqual({ reason: "先核對" });
});

describe("報廢表單", () => {
  it("保留網路失敗輸入與key；重試成功才清空並失效八類查詢", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(json(record));
    vi.stubGlobal("fetch", fetch);
    const { invalidate } = mount(<WasteForm batch={batch} />);
    fireEvent.change(screen.getByRole("textbox", { name: /報廢數量/ }), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("報廢說明"), { target: { value: "過期核對" } });
    fireEvent.click(screen.getByRole("button", { name: "送出審核" }));
    await screen.findByText(/上次報廢結果尚未確認/);
    expect((screen.getByRole("textbox", { name: /報廢數量/ }) as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("報廢說明") as HTMLInputElement).value).toBe("過期核對");
    expect(screen.queryByText("報廢申請已送出，待審核")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "送出審核" }));
    await screen.findByText("報廢申請已送出，待審核");
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/waste-records");
    expect(key(fetch.mock.calls[0])).toBe(key(fetch.mock.calls[1]));
    expect(invalidate.mock.calls.map(c => c[0]?.queryKey?.[0]).sort())
      .toEqual(["alerts", "goods-receipt", "inventory", "issue", "reports", "stocktake", "storage-locations", "waste"]);
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
    fireEvent.click(screen.getByRole("button", { name: "送出審核" }));
    await screen.findByText("數量須為正數");
    fireEvent.change(screen.getByRole("textbox", { name: /報廢數量/ }), { target: { value: "1" } });
    const submit = screen.getByRole("button", { name: "送出審核" });
    fireEvent.click(submit); fireEvent.click(submit);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(key(fetch.mock.calls[0])).not.toBe(key(fetch.mock.calls[1]));
    resolve(json(record));
    await screen.findByText("報廢申請已送出，待審核");
  });
  it("URL預選批次由真API載入，清單空資料如實顯示", async () => {
    const fetch = vi.fn(async (url: string) => url.endsWith("/batches/9") ? json(batch)
      : json({ items: [], total: 0, page: 1, page_size: 20 }));
    vi.stubGlobal("fetch", fetch);
    mount(<WasteRecordsPage />, "/waste-records/new?batch_id=9");
    await screen.findByRole("textbox", { name: /報廢數量/ });
    expect(fetch.mock.calls.some(c => c[0] === "/api/v1/waste-records/batches/9")).toBe(true);
    expect(await screen.findByText("尚無已生效報廢紀錄。")).toBeTruthy();
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
  fireEvent.click(screen.getByRole("button", { name: "送出全數報廢審核" }));
  await screen.findByText(/最新剩餘量：1.000/);
  expect(JSON.parse(writes(fetch)[0][1].body).quantity).toBe("2.000");
  fireEvent.click(screen.getAllByRole("button", { name: "取消" }).at(-1)!);
  fireEvent.click(screen.getByText("開啟全數報廢"));
  fireEvent.click(screen.getByRole("button", { name: "送出全數報廢審核" }));
  await waitFor(() => expect(writes(fetch)).toHaveLength(2));
  expect(JSON.parse(writes(fetch)[1][1].body).quantity).toBe("1.000");
  expect(key(writes(fetch)[0])).not.toBe(key(writes(fetch)[1]));
});

it("一般員工清單不出現金額", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => json({
    items: url.includes("batches") || url.includes("requests") ? [] : [record], total: 1, page: 1, page_size: 20,
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
  fireEvent.click(await screen.findByRole("button", { name: "全數報廢申請" }));
  fireEvent.click(screen.getByRole("button", { name: "送出全數報廢審核" }));
  await screen.findByText(/最新剩餘量：1.000/);
  expect(screen.getByText("本次核對數量：2.000 公斤")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "取消" }).at(-1)!);
  fireEvent.click(screen.getByRole("button", { name: "全數報廢申請" }));
  expect(screen.getByText("本次核對數量：1.000 公斤")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "送出全數報廢審核" }));
  await screen.findByText("報廢申請已送出，待管理員審核。");
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
  fireEvent.click(screen.getByRole("button", { name: "送出審核" }));
  const switchBatch = screen.getByRole("button", { name: "移除批次" });
  await waitFor(() => expect((switchBatch as HTMLButtonElement).disabled).toBe(true));
  expect((screen.getByRole("button", { name: "全數報廢申請" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(switchBatch);
  expect((quantity as HTMLInputElement).value).toBe("1");
  expect(writes(fetch)).toHaveLength(1);
  finish(json(record));
  await screen.findByText("報廢申請已送出，待管理員審核。");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});


it("全數報廢結果未知時關框重開仍重試原快照與key", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(json(record));
  vi.stubGlobal("fetch", fetch);
  mount(<FullHarness />);
  fireEvent.click(screen.getByText("開啟全數報廢"));
  fireEvent.click(screen.getByRole("button", { name: "送出全數報廢審核" }));
  await screen.findByText("上次報廢結果尚未確認，請先重試同筆操作；原數量與原因會保留。");
  fireEvent.click(screen.getAllByRole("button", { name: "取消" }).at(-1)!);
  fireEvent.click(screen.getByText("模擬新餘量"));
  fireEvent.click(screen.getByText("開啟全數報廢"));
  expect(screen.getByText("本次核對數量：2.000 公斤")).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "全數報廢原因" }) as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "送出全數報廢審核" }));
  await waitFor(() => expect(writes(fetch)).toHaveLength(2));
  expect(key(writes(fetch)[0])).toBe(key(writes(fetch)[1]));
  expect(JSON.parse(writes(fetch)[0][1].body)).toEqual(JSON.parse(writes(fetch)[1][1].body));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
