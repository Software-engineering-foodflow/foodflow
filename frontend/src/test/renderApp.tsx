import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { vi } from "vitest";

import { appRoutes } from "../app/router";
import { theme } from "../app/theme";
import { queryKeys } from "../shared/api/queryKeys";

export const admin = { id: 1, username: "manager", name: "王店長", role: "ADMIN", is_active: true,
  created_at: "2026-11-06T00:00:00Z" };
export const staff = { ...admin, id: 2, username: "staff", name: "員工", role: "STAFF" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** 以完整路由表渲染指定路徑；`/me` 回傳指定員工，登出後改回 401。 */
export function renderApp(path: string, employee: typeof admin = admin) {
  let signedOut = false;
  const fetchMock = vi.fn(async (input: string) => {
    if (input.endsWith("/logout")) { signedOut = true; return new Response(null, { status: 204 }); }
    if (input.endsWith("/me")) {
      return signedOut
        ? json({ error: { code: "UNAUTHENTICATED", message: "尚未登入", details: {}, fields: [] } }, 401)
        : json(employee);
    }
    if (input === "/health") return json({ status: "ok", database: "ok" });
    if (["/stocktakes/batches?", "/waste-records?", "/waste-records/batches?", "/inventory-transactions?", "/batch-location-changes?"].some(p => input.includes(p))) {
      return json({ items: [], total: 0, page: 1, page_size: 20 });
    }
    return json({ error: { code: "NOT_FOUND", message: "not stubbed", details: {}, fields: [] } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.auth.all, employee);
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>
    </MantineProvider>,
  );
  return { router, fetchMock };
}
