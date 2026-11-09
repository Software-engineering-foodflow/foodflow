import { Alert, Button, Loader, Stack, Text } from "@mantine/core";
import { Navigate, Outlet, createBrowserRouter, type RouteObject } from "react-router";

import { AlertsPage } from "../features/alerts/pages/AlertsPage";
import { useCurrentEmployee } from "../features/auth/hooks";
import { EmployeesPage } from "../features/auth/pages/EmployeesPage";
import { LoginPage } from "../features/auth/pages/LoginPage";
import { GoodsReceiptsPage } from "../features/goods_receipt/pages/GoodsReceiptsPage";
import { InventoryBatchesPage } from "../features/inventory/pages/InventoryBatchesPage";
import { InventoryBatchHistoryPage } from "../features/inventory/pages/InventoryBatchHistoryPage";
import { InventoryPage } from "../features/inventory/pages/InventoryPage";
import { IssuesPage } from "../features/issue/pages/IssuesPage";
import { IngredientCategoriesPage } from "../features/master_data/pages/IngredientCategoriesPage";
import { IngredientsPage } from "../features/master_data/pages/IngredientsPage";
import { SuppliersPage } from "../features/master_data/pages/SuppliersPage";
import { ReportsPage } from "../features/reports/pages/ReportsPage";
import { StocktakesPage } from "../features/stocktake/pages/StocktakesPage";
import { StorageLocationsPage } from "../features/storage_location/pages/StorageLocationsPage";
import { WasteRecordsPage } from "../features/waste/pages/WasteRecordsPage";
import { routes } from "../shared/routes";
import { AppLayout } from "./layout";

export function RequireLogin() {
  const current = useCurrentEmployee();
  if (current.isPending) return <Loader aria-label="確認登入狀態" m="xl" />;
  if (current.error) {
    if ("status" in current.error && current.error.status === 401) return <Navigate to={routes.login} replace />;
    return <Alert color="red" title="無法確認登入狀態" role="alert" m="xl"><Stack>
      <Text>{current.error.message}</Text><Button onClick={() => void current.refetch()} loading={current.isFetching}>重試</Button>
    </Stack></Alert>;
  }
  return current.data ? <Outlet /> : <Navigate to={routes.login} replace />;
}

// AD-23：路由集中在這裡；AD-17：不使用 loader／action。
export const appRoutes: RouteObject[] = [
  { path: routes.login, element: <LoginPage /> },
  {
    element: <RequireLogin />,
    errorElement: (
      <Alert color="red" title="頁面發生錯誤" role="alert">
        請重新整理頁面後再試一次
      </Alert>
    ),
    children: [
      { element: <AppLayout />, children: [
      { path: routes.home, element: <AlertsPage /> },
      { path: routes.inventory, element: <InventoryPage /> },
      { path: routes.inventoryBatches, element: <InventoryBatchesPage /> },
      { path: routes.inventoryBatchHistory, element: <InventoryBatchHistoryPage /> },
      { path: routes.goodsReceipts, element: <GoodsReceiptsPage /> },
      // 預警動作的目的地；各功能完成前先顯示同一個空白頁，避免連到找不到頁面。
      { path: routes.goodsReceiptNew, element: <GoodsReceiptsPage /> },
      { path: routes.goodsReceiptDetail, element: <GoodsReceiptsPage /> },
      { path: routes.issues, element: <IssuesPage /> },
      { path: routes.issueNew, element: <IssuesPage /> },
      { path: routes.wasteRecords, element: <WasteRecordsPage /> },
      { path: routes.wasteRecordNew, element: <WasteRecordsPage /> },
      { path: routes.stocktakes, element: <StocktakesPage /> },
      { path: routes.reports, element: <ReportsPage /> },
      { path: routes.ingredients, element: <IngredientsPage /> },
      { path: routes.ingredientCategories, element: <IngredientCategoriesPage /> },
      { path: routes.suppliers, element: <SuppliersPage /> },
      { path: routes.storageLocations, element: <StorageLocationsPage /> },
      { path: routes.employees, element: <EmployeesPage /> },
      { path: "*", element: <Text>找不到頁面</Text> },
      ] },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
