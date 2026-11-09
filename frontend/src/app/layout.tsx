import {
  ActionIcon, Alert, AppShell, Box, Burger, Button, Group, NavLink, ScrollArea, Text, Title, useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useEffect, useState, type ComponentType } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

import { useCurrentEmployee, useLogout } from "../features/auth/hooks";
import { routes } from "../shared/routes";
import {
  BellIcon, ChartIcon, ClipboardIcon, FolderIcon, LayersIcon, LeafIcon, LogoutIcon, MapPinIcon, OutboxIcon,
  SidebarIcon, SproutIcon, StoreIcon, TagIcon, TrashIcon, TruckIcon, UsersIcon,
} from "../shared/ui/icons";

interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<{ size?: number }>;
  adminOnly?: boolean;
}

// 依 SRS 第 4.1 節：盤點調整與帳號管理僅限管理者；基本資料一般員工可查詢。
const operationItems: NavItem[] = [
  { label: "預警首頁", to: routes.home, icon: BellIcon },
  { label: "庫存", to: routes.inventory, icon: LayersIcon },
  { label: "進貨", to: routes.goodsReceipts, icon: TruckIcon },
  { label: "領用", to: routes.issues, icon: OutboxIcon },
  { label: "報廢", to: routes.wasteRecords, icon: TrashIcon },
  { label: "盤點", to: routes.stocktakes, icon: ClipboardIcon, adminOnly: true },
  { label: "異動與統計", to: routes.reports, icon: ChartIcon },
];
const masterDataItems: NavItem[] = [
  { label: "食材", to: routes.ingredients, icon: LeafIcon },
  { label: "分類", to: routes.ingredientCategories, icon: TagIcon },
  { label: "供應商", to: routes.suppliers, icon: StoreIcon },
  { label: "儲存位置", to: routes.storageLocations, icon: MapPinIcon },
];
const accountItems: NavItem[] = [
  { label: "員工帳號", to: routes.employees, icon: UsersIcon, adminOnly: true },
];

const NAVBAR_ID = "app-navbar";
// useMediaQuery 與 AppShell 共用同一個斷點，避免按鈕狀態與實際收合規則錯開。
const NAVBAR_BREAKPOINT = "sm";
/** 窄螢幕簡版頂部列的高度。寬螢幕沒有頂部列。 */
const HEADER_HEIGHT = 60;
/** 寬螢幕收合後，左上角展開鈕的位置；內容區左側讓出同樣的空間，避免蓋住標題。 */
const EXPAND_INSET = 12;

function isActive(pathname: string, to: string) {
  // React Router 預設不分大小寫，比對時一併忽略。
  const path = pathname.toLowerCase();
  return to === routes.home ? path === to : path === to || path.startsWith(`${to}/`);
}

/** 品牌：34px 漸層 logo、「食序 FoodFlow」與小字（DESIGN.md › 側欄導覽）。 */
function Brand({ subtitle = true }: { subtitle?: boolean }) {
  return <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
    <Box className="ff-icon-tile" w={34} h={34} style={{ borderRadius: "var(--mantine-radius-md)" }}
      aria-hidden="true"><SproutIcon size={20} /></Box>
    <Box style={{ lineHeight: 1.2, whiteSpace: "nowrap" }}>
      <Title order={3} fz={17} fw={900} c="forest.9" lh={1.2} style={{ whiteSpace: "nowrap" }}>食序 FoodFlow</Title>
      {subtitle && <Text fz="xs" style={{ color: "var(--ff-sidebar-muted)" }}>餐廳食材管理</Text>}
    </Box>
  </Group>;
}

export function AppLayout() {
  const current = useCurrentEmployee();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useMantineTheme();
  // 寬度達斷點（含 1024×768 平板）時導覽列與內容並排、沒有頂部列；以下改為頂部列加覆蓋式導覽。
  const wide = useMediaQuery(`(min-width: ${theme.breakpoints[NAVBAR_BREAKPOINT]})`, true, { getInitialValueInEffect: false });
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);
  const opened = wide ? desktopOpened : mobileOpened;
  const toggle = wide ? toggleDesktop : toggleMobile;
  const isAdmin = current.data?.role === "ADMIN";
  const visible = (items: NavItem[]) => items.filter((item) => isAdmin || !item.adminOnly);
  const masterDataActive = masterDataItems.some((item) => isActive(pathname, item.to));
  const [masterDataOpened, setMasterDataOpened] = useState(masterDataActive);
  const toggleProps = {
    "aria-label": opened ? "收合導覽列" : "展開導覽列", "aria-expanded": opened, "aria-controls": NAVBAR_ID,
  };

  // 換頁（含瀏覽器上一頁）時關閉覆蓋式導覽，並展開目前頁面所在的群組。
  useEffect(() => {
    closeMobile();
    if (masterDataActive) setMasterDataOpened(true);
  }, [pathname, masterDataActive, closeMobile]);

  async function signOut() {
    try {
      await logout.mutateAsync();
      navigate(routes.login, { replace: true });
    } catch { /* Keep retry available when logout did not complete. */ }
  }
  function link(item: NavItem) {
    const active = isActive(pathname, item.to);
    return <NavLink key={item.to} component={Link} to={item.to} label={item.label} active={active}
      leftSection={<item.icon size={18} />} aria-current={active ? "page" : undefined} onClick={closeMobile} mih={44} />;
  }

  const name = current.data?.name ?? "";
  const role = current.data?.role === "ADMIN" ? "管理者" : "一般員工";
  const collapsedWide = wide && !desktopOpened;

  return (
    <AppShell header={wide ? undefined : { height: HEADER_HEIGHT }} padding={{ base: 16, sm: 24, lg: 32 }}
      styles={{
        header: { background: "var(--ff-surface-raised)", backdropFilter: "blur(8px)", borderColor: "var(--ff-line)" },
        navbar: { background: "var(--ff-sidebar)", borderColor: "var(--ff-line-nested)" },
      }}
      navbar={{ width: 236, breakpoint: NAVBAR_BREAKPOINT, collapsed: { mobile: !mobileOpened, desktop: !desktopOpened } }}>
      {/* 窄螢幕：簡版頂部列，只放收合鈕與品牌；使用者與登出在導覽列底部。 */}
      {!wide && <AppShell.Header>
        <Group h="100%" px="md" gap="sm" wrap="nowrap">
          <Burger opened={opened} onClick={toggle} size="sm" w={44} h={44} style={{ flexShrink: 0 }} {...toggleProps} />
          <Brand subtitle={false} />
        </Group>
      </AppShell.Header>}
      {/* 寬螢幕收合後，畫面左上角留一個展開鈕。 */}
      {collapsedWide && <ActionIcon variant="default" size={30} radius="md" onClick={toggle} {...toggleProps} className="ff-hit-44"
        style={{ position: "fixed", top: EXPAND_INSET, left: EXPAND_INSET, zIndex: 150 }}>
        <SidebarIcon size={16} style={{ transform: "scaleX(-1)" }} />
      </ActionIcon>}
      {/* 收合時導覽列只是移出畫面，inert 讓裡面的連結不會被鍵盤聚焦。 */}
      <AppShell.Navbar id={NAVBAR_ID} p="sm" aria-label="主要導覽" inert={!opened}>
        {wide && <AppShell.Section pb="sm" mb="xs" style={{ borderBottom: "1px solid var(--ff-line-nested)" }}>
          <Group justify="space-between" wrap="nowrap" gap={4} pl={4}>
            <Brand />
            {/* 只在展開時可操作（收合後整個導覽列 inert），所以固定是「收合」。 */}
            <ActionIcon variant="subtle" color="gray" size={30} radius="md" onClick={toggle} className="ff-hit-44"
              aria-label="收合導覽列" aria-expanded={opened} aria-controls={NAVBAR_ID} data-sidebar-toggle>
              <SidebarIcon size={16} />
            </ActionIcon>
          </Group>
        </AppShell.Section>}
        <AppShell.Section grow component={ScrollArea}>
          {visible(operationItems).map(link)}
          {/* 群組收起時由父項目標示目前所在位置。 */}
          <NavLink component="button" type="button" label="基本資料" mih={44} leftSection={<FolderIcon size={18} />}
            opened={masterDataOpened} onChange={setMasterDataOpened} active={masterDataActive && !masterDataOpened}>
            {visible(masterDataItems).map(link)}
          </NavLink>
          {visible(accountItems).map(link)}
        </AppShell.Section>
        {/* 目前使用者卡：頭像、姓名、角色與登出。 */}
        <AppShell.Section mt="xs" p={8} aria-label="目前使用者" component="section"
          style={{ borderRadius: "var(--mantine-radius-lg)", background: "var(--ff-surface-raised)" }}>
          <Group gap="sm" wrap="nowrap">
            <Box className="ff-icon-tile" w={32} h={32} fw={800} fz="sm" aria-hidden="true"
              style={{ borderRadius: "50%" }}>{Array.from(name)[0] ?? ""}</Box>
            <Box style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
              <Text fz="sm" fw={600} truncate title={name}>{name}</Text>
              <Text fz="xs" style={{ color: "var(--ff-sidebar-muted)" }}>{role}</Text>
            </Box>
            <Button variant="subtle" color="gray" px={8} leftSection={<LogoutIcon size={16} />}
              onClick={() => void signOut()} loading={logout.isPending} style={{ flexShrink: 0 }}>登出</Button>
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main style={collapsedWide ? {
        paddingInlineStart: `calc(var(--app-shell-navbar-offset, 0px) + ${EXPAND_INSET * 2 + 44}px)`,
      } : undefined}>
        {logout.error && <Alert color="red" role="alert" mb="md" title="登出未完成">{logout.error.message}，請再試一次。</Alert>}
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
