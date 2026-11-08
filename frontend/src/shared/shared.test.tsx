import { MantineProvider } from "@mantine/core";
import { QueryClient } from "@tanstack/react-query";
import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, request } from "./api/client";
import { createQueryClient, invalidateStockQueries, queryKeys } from "./api/queryKeys";
import { useIdempotencyKey } from "./hooks/useIdempotencyKey";
import { alertActionPath } from "./routes";
import { StatusBadge } from "./ui/StatusBadge";
import { statusBadgeMap, type BadgeStatus } from "./ui/statusBadgeMap";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe("request", () => {
  it("sends JSON body with idempotency key and same-origin credentials", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { id: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await request<{ id: number }>("/api/v1/issues", {
      method: "POST",
      body: { quantity: "1.000" },
      idempotencyKey: "key-1",
    });

    expect(result).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/issues",
      expect.objectContaining({
        method: "POST",
        body: '{"quantity":"1.000"}',
        credentials: "same-origin",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Idempotency-Key": "key-1",
        }),
      }),
    );
  });

  it("turns the unified error format into ApiError", async () => {
    const body = {
      error: {
        code: "INSUFFICIENT_STOCK",
        message: "可用量不足",
        details: { batch_id: 1, remaining_quantity: "2.000", available_quantity: null },
        fields: [{ field: "lines.0.quantity", message: "超過剩餘量" }],
      },
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(409, body)));

    const error = await request("/api/v1/issues").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "INSUFFICIENT_STOCK",
      message: "可用量不足",
      fields: body.error.fields,
    });
  });

  it("redirects to the login page on 401 and still rejects", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/inventory", assign });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(401, {
          error: { code: "UNAUTHENTICATED", message: "尚未登入", details: {}, fields: [] },
        }),
      ),
    );

    await expect(request("/api/v1/inventory")).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("turns a network failure into ApiError with a Chinese message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await request("/api/v1/inventory").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 0,
      code: "INTERNAL_ERROR",
      message: "無法連線到伺服器，請確認網路後再試",
    });
  });

  it("rethrows AbortError as is", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));

    await expect(request("/api/v1/inventory")).rejects.toBe(abort);
  });

  it("rejects a 2xx response that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));

    await expect(request("/api/v1/inventory")).rejects.toMatchObject({
      status: 200,
      code: "INTERNAL_ERROR",
    });
  });

  it("rejects an accepted status that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));

    await expect(request("/health", { acceptStatuses: [503] })).rejects.toBeInstanceOf(ApiError);
  });

  it("returns undefined for 204", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));

    await expect(request("/api/v1/inventory")).resolves.toBeUndefined();
  });

  it("does not redirect again when already on the login page", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/login", assign });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(401, {
          error: { code: "UNAUTHENTICATED", message: "尚未登入", details: {}, fields: [] },
        }),
      ),
    );

    await expect(request("/api/v1/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("invalidateStockQueries", () => {
  it("invalidates every stock related feature and nothing else", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateStockQueries(queryClient);

    const invalidated = invalidate.mock.calls.map(([filters]) => filters?.queryKey?.[0]);
    expect(invalidated.sort()).toEqual(
      ["alerts", "goods-receipt", "inventory", "issue", "reports", "stocktake", "storage-locations", "waste"]
        .sort(),
    );
  });

  it("query key roots are unique", () => {
    const roots = Object.values(queryKeys).map((entry) => entry.all[0]);
    expect(new Set(roots).size).toBe(roots.length);
  });

  it("keeps alerts and inventory always stale", () => {
    const queryClient = createQueryClient();
    expect(queryClient.getQueryDefaults(queryKeys.alerts.all).staleTime).toBe(0);
    expect(queryClient.getQueryDefaults(queryKeys.inventory.all).staleTime).toBe(0);
  });
});

describe("createQueryClient retry", () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry as (
    failureCount: number,
    error: Error,
  ) => boolean;
  const apiError = (status: number) =>
    new ApiError(status, { code: "INTERNAL_ERROR", message: "x", details: {}, fields: [] });

  it("does not retry 4xx ApiError", () => {
    expect(retry(0, apiError(404))).toBe(false);
    expect(retry(0, apiError(409))).toBe(false);
  });

  it.each([
    ["ApiError 500", apiError(500)],
    ["network failure", apiError(0)],
    ["other errors", new Error("x")],
  ])("retries %s at most 3 times", (_name, error) => {
    expect(retry(2, error)).toBe(true);
    expect(retry(3, error)).toBe(false);
  });
});

describe("useIdempotencyKey", () => {
  it("keeps the key across renders and changes it only on rotate", () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const first = result.current.key;
    expect(first).toMatch(/^[0-9a-f-]{36}$/);

    rerender();
    expect(result.current.key).toBe(first);

    act(() => result.current.rotate());
    expect(result.current.key).not.toBe(first);
  });
});

describe("alertActionPath", () => {
  it("maps each alert action to its route and parameter", () => {
    expect(alertActionPath({ type: "ISSUE", ingredient_id: 5 })).toBe(
      "/issues/new?ingredient_id=5",
    );
    expect(alertActionPath({ type: "WASTE", ingredient_id: 5, batch_id: 9 })).toBe(
      "/waste-records/new?batch_id=9",
    );
    expect(alertActionPath({ type: "CREATE_GOODS_RECEIPT", ingredient_id: 5 })).toBe(
      "/goods-receipts/new?ingredient_id=5",
    );
  });

  it("refuses a waste action without a batch", () => {
    expect(() => alertActionPath({ type: "WASTE", ingredient_id: 5 })).toThrow();
  });
});

describe("StatusBadge", () => {
  it.each(Object.keys(statusBadgeMap) as BadgeStatus[])("shows text for %s", (status) => {
    render(
      <MantineProvider>
        <StatusBadge status={status} />
      </MantineProvider>,
    );
    expect(screen.getByText(statusBadgeMap[status].label)).toBeTruthy();
  });
});
