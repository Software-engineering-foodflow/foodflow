import {
  AccordionChevron, ActionIcon, Affix, Alert, Badge, Box, Button, Group, Loader, Menu, Pagination,
  Paper, Select, SimpleGrid, Stack, Table, Text, ThemeIcon, VisuallyHidden,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Fragment, useCallback, useEffect, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";

import { useCurrentEmployee } from "../../auth/hooks";
import { ActiveBadge } from "../../../shared/ui/ActiveBadge";
import { CodeTag } from "../../../shared/ui/CodeTag";
import { DataTable } from "../../../shared/ui/DataTable";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormModal } from "../../../shared/ui/FormModal";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import { StorageTypeIcon } from "../../../shared/ui/StorageTypeIcon";
import { SearchInput, Toolbar } from "../../../shared/ui/Toolbar";
import {
  BoxIcon, DotsIcon, MapPinIcon, PencilIcon, PlusIcon, SearchIcon, SwapIcon, TrashIcon,
} from "../../../shared/ui/icons";
import { storageTypeLabels, storageTypeOptions, type StorageType } from "../../../shared/storageTypes";
import { DeleteConfirm, LocationForm, MoveBatchForm } from "../components/StorageLocationForms";
import classes from "./StorageLocationsPage.module.css";
import {
  PAGE_SIZE, useLocationBatches, useStorageLocationSummary, useStorageLocations,
  type LocationBatch, type StorageLocation, type StorageLocationRow, type StorageTypeSummary,
} from "../hooks";

/** 版面：1024 以上（含平板橫向）用表格、平板直向用卡片、手機用扁平清單。 */
type Layout = "table" | "cards" | "list";

/** 空值一律顯示「—」配停用色（DESIGN.md › 資料表格）。 */
const Empty = () => <Text span size="sm" style={{ color: "var(--ff-text-disabled)" }}>—</Text>;

/** 最近到期：狀態與天數都是後端回傳的，沒有剩餘批次時是「—」。 */
function NearestExpiry({ location }: { location: StorageLocationRow }) {
  if (!location.nearest_expiry_status || location.nearest_days_until_expiry == null) return <Empty />;
  return <StatusBadge status={location.nearest_expiry_status} days={location.nearest_days_until_expiry} />;
}

/** 類型：圖示方塊只是輔助，類型一定以文字標示（NFR-01）。 */
function TypeLabel({ location }: { location: StorageLocationRow }) {
  return <Group gap={8} wrap="nowrap">
    <StorageTypeIcon type={location.storage_type} size={28} muted={!location.is_active} />
    <Text span size="sm" style={{ whiteSpace: "nowrap" }}>{storageTypeLabels[location.storage_type]}</Text>
  </Group>;
}

function ExpandToggle({ location, expanded, onToggle }: {
  location: StorageLocation; expanded: boolean; onToggle: () => void;
}) {
  return <ActionIcon variant={expanded ? "filled" : "subtle"} color={expanded ? "forest" : "gray"} size={44}
    radius="md" aria-expanded={expanded} aria-label={`${expanded ? "收合" : "查看"} ${location.code} 的批次`}
    onClick={onToggle} style={{ flexShrink: 0 }}>
    <AccordionChevron style={{ transition: "transform 150ms ease",
      transform: expanded ? "rotate(180deg)" : undefined }} />
  </ActionIcon>;
}

/** 清單項目依序進場，最多延遲到第 10 個，避免長清單等太久。 */
const stagger = (index: number, base = 0) =>
  ({ "--delay": `${base + Math.min(index, 10) * 70}ms` }) as CSSProperties;

/** 補充說明只放「N 批」再加最緊急的一項非零數（過期 → 今日到期 → 即期），1024 寬度才不會換行。 */
function typeNote(summary: StorageTypeSummary) {
  const urgent = [
    [summary.expired_count, "過期"], [summary.expires_today_count, "今日到期"], [summary.expiring_soon_count, "即期"],
  ].find(([count]) => Number(count) > 0);
  return urgent ? `${summary.batch_count} 批 · ${urgent[0]} ${urgent[1]}` : `${summary.batch_count} 批`;
}

function SummaryCard({ icon, label, value, note, index }: {
  icon: ReactNode; label: string; value: ReactNode; note: string; index: number;
}) {
  // 卡片高度貼齊 40px 圖示：右側兩行，第一行「數字＋名稱」、第二行補充說明，合計約 40px。
  // 1024 寬度每張卡約 177px，「6 批 · 1 今日到期」才不會換行或溢出。
  return <Paper radius="lg" shadow="xs" px={8} py={10} className={`${classes.enter} ff-raised`} data-summary-card
    style={{ ...stagger(index, 80), border: "1px solid var(--ff-surface)" }}>
    <Group gap={8} wrap="nowrap" align="center">
      {icon}
      <Box style={{ minWidth: 0, whiteSpace: "nowrap" }}>
        <Group gap={6} wrap="nowrap" align="baseline">
          <Text fz={18} fw={800} lh={1.2} data-summary-value>{value}</Text>
          <Text fz="sm" fw={600} truncate>{label}</Text>
        </Group>
        {/* 數字更大時以刪節號收尾，不換行也不溢出卡片。 */}
        <Text fz="xs" c="dimmed" lh={1.3} truncate title={note}>{note}</Text>
      </Box>
    </Group>
  </Paper>;
}

/** 4 張摘要卡：啟用中位置與各類型；只算啟用位置，數字都來自 summary API。 */
function LocationSummary() {
  const summary = useStorageLocationSummary();
  if (summary.error) return null;
  const data = summary.data;
  const pending = summary.isPending;
  const inactive = data ? data.total_count - data.active_count : 0;
  const activeNote = !data ? "—" : inactive > 0 ? `共 ${data.total_count} 個 · ${inactive} 停用` : `共 ${data.total_count} 個`;
  return <SimpleGrid component="section" aria-label="位置摘要" cols={{ base: 2, md: 4 }} spacing={8}>
    <SummaryCard index={0} label="啟用中位置" value={pending ? "—" : data?.active_count} note={activeNote}
      icon={<ThemeIcon size={40} radius="md" variant="light" color="forest" aria-hidden="true">
        <MapPinIcon size={20} /></ThemeIcon>} />
    {storageTypeOptions.map((option, index) => {
      const row = data?.by_type.find((item) => item.storage_type === option.value);
      return <SummaryCard key={option.value} index={index + 1} label={option.label}
        value={pending ? "—" : row?.location_count ?? 0} note={row ? typeNote(row) : "—"}
        icon={<StorageTypeIcon type={option.value as StorageType} size={40} />} />;
    })}
  </SimpleGrid>;
}

function LocationBatches({ location, isAdmin, layout, onMove, onSettled }: {
  location: StorageLocation; isAdmin: boolean; layout: Layout;
  onMove: (batch: LocationBatch) => void; onSettled: (locationId: number) => void;
}) {
  const batches = useLocationBatches(location.id);
  // 批次載入完、頁面高度確定後才捲動；否則第一次展開時頁面不夠高，捲不到位。
  useEffect(() => {
    if (!batches.isPending) onSettled(location.id);
  }, [batches.isPending, location.id, onSettled]);

  if (batches.isPending) return <Group role="status" py="sm" px="md"><Loader size="sm" /><Text>載入批次中…</Text></Group>;
  if (batches.error) return <Alert color="red" title="無法載入批次" role="alert"><Stack gap="sm">
    <Text>{batches.error.message}</Text>
    <Button variant="light" onClick={() => void batches.refetch()} loading={batches.isFetching}>重新載入</Button>
  </Stack></Alert>;
  const { items, total } = batches.data;
  if (items.length === 0) return <Group gap="sm" py="xs" px={layout === "table" ? "md" : 0}>
    <ThemeIcon size={32} radius="xl" variant="light" color="gray"><BoxIcon size={17} /></ThemeIcon>
    <Text c="dimmed" size="sm">此位置目前沒有剩餘庫存的批次。</Text>
  </Group>;

  const label = `${location.code} 的批次`;
  const moveButton = (batch: LocationBatch, size?: string) => isAdmin &&
    <Button variant="default" size={size} leftSection={<SwapIcon size={16} />} style={{ flexShrink: 0 }}
      aria-label={`換位置 ${batch.batch_number}`} onClick={() => onMove(batch)}>換位置</Button>;
  const quantity = (batch: LocationBatch, size = "md") => <Text ta="right" style={{ whiteSpace: "nowrap" }}>
    <Text span fw={700} fz={size}>{batch.remaining_quantity}</Text>
    <Text span size="xs" c="dimmed"> {batch.unit}</Text>
  </Text>;
  const status = (batch: LocationBatch) => <StatusBadge status={batch.expiry_status} days={batch.days_until_expiry} />;
  const overflow = total > items.length && <Alert color="orange" variant="light" p="xs">
    共 {total} 個批次，只顯示到期日最早的 {items.length} 個。</Alert>;

  if (layout === "table") return <Stack gap={0}>
    <Group justify="space-between" gap="xs" px="md" py="sm"
      style={{ background: "var(--ff-gradient-toolbar)", borderBottom: "1px solid var(--ff-line-soft)" }}>
      <Group gap={8}>
        <Text fw={700} fz="sm">目前存放</Text>
        <Badge variant="filled" color="forest" radius="xl">{total} 個批次</Badge>
      </Group>
      <Text size="xs" c="dimmed">依到期日排序，最早到期在前</Text>
    </Group>
    {overflow && <Box p="sm">{overflow}</Box>}
    <DataTable flush label={label} head={<>
      {/* 五欄平均分配寬度，避免「食材」吃掉剩餘空間、右側四欄擠在一起。 */}
      <Table.Th w="20%">食材</Table.Th><Table.Th w="20%">批號</Table.Th><Table.Th w="20%" ta="right">剩餘量</Table.Th>
      <Table.Th w="20%" ta="center">到期日</Table.Th><Table.Th w="20%">狀態</Table.Th>
      {isAdmin && <Table.Th w={1}><VisuallyHidden>操作</VisuallyHidden></Table.Th>}
    </>}>
      {items.map((batch, index) => <Table.Tr key={batch.id} className={classes.enter} style={stagger(index, 40)}>
        <Table.Td fw={700}>{batch.ingredient_name}</Table.Td>
        <Table.Td><CodeTag code={batch.batch_number} /></Table.Td>
        <Table.Td ta="right">{quantity(batch)}</Table.Td>
        <Table.Td ta="center" style={{ whiteSpace: "nowrap" }}>{batch.expiry_date}</Table.Td>
        <Table.Td>{status(batch)}</Table.Td>
        {isAdmin && <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>{moveButton(batch)}</Table.Td>}
      </Table.Tr>)}
    </DataTable>
  </Stack>;

  const heading = <Group justify="space-between" gap="xs">
    <Text size="xs" c="dimmed" fw={600}>{total} 個批次 · 最早到期在前</Text>
  </Group>;

  if (layout === "cards") return <Stack gap="sm">
    {heading}
    {overflow}
    <SimpleGrid component="ul" aria-label={label} cols={2} spacing="xs" m={0} p={0} style={{ listStyle: "none" }}>
      {items.map((batch, index) => <Paper component="li" key={batch.id} withBorder radius="md" p="sm" shadow="xs"
        className={classes.enter} style={stagger(index, 40)}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap={8} style={{ minWidth: 0 }}>
            <Text fw={600}>{batch.ingredient_name}</Text>
            <CodeTag code={batch.batch_number} />
          </Group>
          {quantity(batch, "lg")}
        </Group>
        <Group justify="space-between" align="flex-end" mt={6} gap="xs" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text size="sm" c="dimmed">到期日 {batch.expiry_date}</Text>
            {status(batch)}
          </Stack>
          {moveButton(batch)}
        </Group>
      </Paper>)}
    </SimpleGrid>
  </Stack>;

  // 手機：白底清單列加分隔線，不再卡片包卡片。
  return <Stack gap="sm">
    {heading}
    {overflow}
    <Paper component="ul" aria-label={label} radius="md" withBorder m={0} p={0}
      style={{ listStyle: "none", overflow: "hidden" }}>
      {items.map((batch, index) => <Box component="li" key={batch.id} px="md" py="sm" className={classes.enter}
        style={{ ...stagger(index, 40), ...(index > 0 ? { borderTop: "1px solid var(--ff-line-soft)" } : {}) }}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Box style={{ minWidth: 0 }}>
            <Text fw={600} truncate>{batch.ingredient_name}</Text>
            <Text size="xs" c="dimmed" ff="monospace">{batch.batch_number}</Text>
          </Box>
          {quantity(batch, "lg")}
        </Group>
        <Group justify="space-between" wrap="nowrap" gap="sm" mt={6}>
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <Text size="xs" c="dimmed">到期 {batch.expiry_date}</Text>
            {status(batch)}
          </Group>
          {moveButton(batch, "compact-sm")}
        </Group>
      </Box>)}
    </Paper>
  </Stack>;
}

function LocationsEmpty({ filtered, isAdmin, onCreate }: { filtered: boolean; isAdmin: boolean; onCreate: () => void }) {
  return <EmptyState icon={filtered ? <SearchIcon size={24} /> : <MapPinIcon size={24} />}
    title={filtered ? "沒有符合條件的位置" : "還沒有儲存位置"}
    description={filtered ? "請調整搜尋或篩選條件。" : "先建立店內固定的冷藏庫、冷凍庫與常溫架，進貨時就能直接選擇。"}
    action={!filtered && isAdmin && <Button variant="default" leftSection={<PlusIcon size={16} />} onClick={onCreate}>
      新增第一個位置</Button>} />;
}

export function StorageLocationsPage() {
  const theme = useMantineTheme();
  // 1024×768 平板（內容約 740px）也用表格；未達 md 才改用卡片。
  const wide = useMediaQuery(`(min-width: ${theme.breakpoints.md})`, false, { getInitialValueInEffect: false });
  // 手機寬度：扁平清單、浮動新增鈕、對話框全螢幕。
  const phone = useMediaQuery(`(max-width: ${theme.breakpoints.xs})`, false, { getInitialValueInEffect: false });
  const layout: Layout = wide ? "table" : phone ? "list" : "cards";
  const current = useCurrentEmployee();
  const isAdmin = current.data?.role === "ADMIN";
  const [search, setSearch] = useState("");
  const [storageType, setStorageType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const locations = useStorageLocations({ search, storageType, status, page });
  const [editing, setEditing] = useState<StorageLocation | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<StorageLocation | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [moving, setMoving] = useState<LocationBatch | null>(null);
  const [success, setSuccess] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const filtered = search.trim() !== "" || storageType !== "" || status !== "";

  function done(message: string) {
    // 刪除或停用可能讓目前頁變空且分頁元件消失，回到第 1 頁。
    setPage(1);
    setSuccess(message);
    setEditing(undefined);
    setDeleting(null);
    setMoving(null);
  }
  const create = () => { setEditing(null); setSuccess(""); };
  const toggle = (id: number) => setExpanded(expanded === id ? null : id);
  // 展開的位置捲到畫面上方，批次清單才不會落在畫面外；收合時不捲動。
  const scrollToLocation = useCallback((id: number) => {
    const target = document.querySelector(`[data-location-id="${id}"]`);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);
  const edit = (location: StorageLocation) => { setEditing(location); setSuccess(""); };
  const remove = (location: StorageLocation) => { setDeleting(location); setSuccess(""); };
  /** 管理者的編輯／刪除收在列尾 44px「⋯」選單；一般員工不顯示。 */
  const actionMenu = (location: StorageLocation) => <Menu position="bottom-end" withinPortal shadow="lg">
    <Menu.Target>
      <ActionIcon variant="subtle" color="gray" size={44} radius="md" aria-label={`${location.code} 的操作`}
        style={{ flexShrink: 0 }}>
        <DotsIcon size={20} />
      </ActionIcon>
    </Menu.Target>
    <Menu.Dropdown>
      <Menu.Item leftSection={<PencilIcon size={16} />} aria-label={`編輯 ${location.code}`} mih={44}
        onClick={() => edit(location)}>編輯</Menu.Item>
      <Menu.Item color="red" leftSection={<TrashIcon size={16} />} aria-label={`刪除 ${location.code}`} mih={44}
        onClick={() => remove(location)}>刪除</Menu.Item>
    </Menu.Dropdown>
  </Menu>;
  const rowEnd = (location: StorageLocation, open: boolean) => <Group gap={4} wrap="nowrap" justify="flex-end">
    {isAdmin && actionMenu(location)}
    <ExpandToggle location={location} expanded={open} onToggle={() => toggle(location.id)} />
  </Group>;
  const batches = (location: StorageLocation) => <LocationBatches location={location} isAdmin={isAdmin}
    layout={layout} onMove={(batch) => { setMoving(batch); setSuccess(""); }} onSettled={scrollToLocation} />;
  const meta = (location: StorageLocationRow) => [
    location.code, storageTypeLabels[location.storage_type], `${location.batch_count} 批`,
  ].join(" · ");
  const expandedPanel = (location: StorageLocation) => <Box mt="md" mx={-16} mb={-16} p={16}
    className={classes.reveal} style={{ background: "var(--ff-surface-selected)",
      borderTop: "1px solid var(--ff-line-selected)",
      borderRadius: `0 0 var(--mantine-radius-${phone ? "lg" : "md"}) var(--mantine-radius-${phone ? "lg" : "md"})` }}>
    {batches(location)}</Box>;

  const items = locations.data?.items ?? [];
  const columnCount = 7;
  const list = () => {
    if (layout === "table") return <DataTable flush head={<>
      {/* 名稱只拿剩下的寬度（約四分之一），右側四欄往左分散，不會擠在一起。 */}
      <Table.Th w="10%">代碼</Table.Th><Table.Th>名稱</Table.Th><Table.Th w="14%">類型</Table.Th>
      <Table.Th w="11%">批次</Table.Th><Table.Th w="18%">最近到期</Table.Th><Table.Th w="12%">狀態</Table.Th>
      <Table.Th w={isAdmin ? 124 : 76}><VisuallyHidden>操作與批次</VisuallyHidden></Table.Th>
    </>}>
      {items.map((location, index) => {
        const open = expanded === location.id;
        return <Fragment key={location.id}>
          <Table.Tr data-location={location.code} data-location-id={location.id} data-open={open || undefined}
            opacity={location.is_active ? 1 : 0.6} className={`${classes.enter} ${classes.anchor}`}
            style={{ ...stagger(index, 240),
              ...(open ? { background: "var(--ff-surface-selected)", boxShadow: "inset 0 1px 0 var(--ff-line-selected)" } : {}) }}>
            <Table.Td><CodeTag code={location.code} /></Table.Td>
            <Table.Td fw={700} c={open ? "forest.9" : undefined} style={{ minWidth: 0 }}>
              <Text span inherit lineClamp={1}>{location.name}</Text>
            </Table.Td>
            <Table.Td><TypeLabel location={location} /></Table.Td>
            <Table.Td style={{ whiteSpace: "nowrap" }}>{location.batch_count} 批</Table.Td>
            <Table.Td><NearestExpiry location={location} /></Table.Td>
            <Table.Td><ActiveBadge active={location.is_active} /></Table.Td>
            <Table.Td px="xs">{rowEnd(location, open)}</Table.Td>
          </Table.Tr>
          {open && <Table.Tr className={classes.reveal}><Table.Td colSpan={columnCount} px="md" pt={2} pb="md"
            style={{ background: "var(--ff-surface-selected)", borderBottom: "1px solid var(--ff-line-selected)" }}>
            <Paper radius="lg" shadow="sm" style={{ overflow: "hidden", border: "1px solid var(--ff-line-nested)" }}>
              {batches(location)}
            </Paper>
          </Table.Td></Table.Tr>}
        </Fragment>;
      })}
    </DataTable>;

    if (layout === "cards") return <Stack gap="sm">{items.map((location, index) => {
      const open = expanded === location.id;
      return <Paper key={location.id} component="article" data-location={location.code} data-location-id={location.id}
        withBorder radius="md" p="md" shadow={open ? "sm" : "xs"} opacity={location.is_active ? 1 : 0.75}
        aria-label={`${location.code} ${location.name}`} className={`${classes.enter} ${classes.anchor}`}
        style={{ ...stagger(index, 240), ...(open ? { borderColor: "var(--mantine-color-forest-3)" } : {}) }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" align="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
            <StorageTypeIcon type={location.storage_type} muted={!location.is_active} />
            <Stack gap={6} style={{ minWidth: 0 }}>
              <Group gap="xs">
                <Text fw={700} c={open ? "forest.9" : undefined}>{location.name}</Text>
                <CodeTag code={location.code} />
              </Group>
              {location.description && <Text size="sm" c="dimmed" lineClamp={1}>{location.description}</Text>}
              <Group gap="xs">
                <Text size="sm">{storageTypeLabels[location.storage_type]}</Text>
                <Text size="sm" c="dimmed">{location.batch_count} 批</Text>
                <NearestExpiry location={location} />
                <ActiveBadge active={location.is_active} />
              </Group>
            </Stack>
          </Group>
          <Box mr={-6} mt={-6}>{rowEnd(location, open)}</Box>
        </Group>
        {open && expandedPanel(location)}
      </Paper>;
    })}</Stack>;

    // 手機：一列一個位置，圖示＋兩行文字＋右側操作，比照常見 App 的清單列。
    return <Stack gap="sm">{items.map((location, index) => {
      const open = expanded === location.id;
      return <Paper key={location.id} component="article" data-location={location.code} data-location-id={location.id}
        radius="lg" p="md" withBorder opacity={location.is_active ? 1 : 0.7}
        aria-label={`${location.code} ${location.name}`} className={`${classes.enter} ${classes.anchor}`}
        style={{ ...stagger(index, 240), ...(open ? { borderColor: "var(--mantine-color-forest-3)" } : {}) }}>
        <Group gap="md" wrap="nowrap">
          <StorageTypeIcon type={location.storage_type} muted={!location.is_active} size={44} />
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Text fw={700} truncate>{location.name}</Text>
              {!location.is_active && <ActiveBadge active={false} />}
            </Group>
            <Text size="xs" c="dimmed" truncate>{meta(location)}</Text>
            {location.description && <Text size="xs" c="dimmed" lineClamp={1}>{location.description}</Text>}
            <NearestExpiry location={location} />
          </Box>
          <Box mr={-8}>{rowEnd(location, open)}</Box>
        </Group>
        {open && expandedPanel(location)}
      </Paper>;
    })}</Stack>;
  };

  const typeSelect = { "aria-label": "儲存類型", data: [{ value: "", label: "全部類型" }, ...storageTypeOptions],
    value: storageType, allowDeselect: false,
    onChange: (value: string | null) => { setStorageType(value ?? ""); setPage(1); } };
  const statusSelect = { "aria-label": "狀態",
    data: [{ value: "", label: "全部狀態" }, { value: "true", label: "啟用" }, { value: "false", label: "停用" }],
    value: status, allowDeselect: false, onChange: (value: string | null) => { setStatus(value ?? ""); setPage(1); } };
  const searchProps = { "aria-label": "搜尋代碼或名稱", placeholder: "搜尋代碼或名稱", maxLength: 100, value: search,
    onChange: (e: ChangeEvent<HTMLInputElement>) => { setSearch(e.currentTarget.value); setPage(1); } };
  // 平板以上：主卡片頂部的單列工具列；手機：沒有外框，搜尋佔一整列。
  const filters = phone
    ? <Toolbar cols={{ base: 2 }} spacing="xs">
      <SearchInput {...searchProps} radius="xl" style={{ gridColumn: "1 / -1" }} />
      <Select {...typeSelect} radius="xl" /><Select {...statusSelect} radius="xl" />
    </Toolbar>
    : <Toolbar row>
      <SearchInput {...searchProps} /><Select {...typeSelect} /><Select {...statusSelect} />
    </Toolbar>;

  const content = <>
    {locations.isPending && <Group role="status" justify="center" py="xl"><Loader size="sm" /><Text>載入儲存位置中…</Text></Group>}
    {locations.error && <Box p={phone ? 0 : "md"}><Alert color="red" title="無法載入儲存位置" role="alert"><Stack gap="sm">
      <Text>{locations.error.message}</Text>
      <Button variant="light" onClick={() => void locations.refetch()} loading={locations.isFetching}>重新載入</Button>
    </Stack></Alert></Box>}
    {locations.data && (items.length === 0
      ? <LocationsEmpty filtered={filtered} isAdmin={isAdmin} onCreate={create} />
      : layout === "table" ? list() : <Box p={phone ? 0 : "md"}>{list()}</Box>)}
    {locations.data && locations.data.total > PAGE_SIZE && <Group justify="center" p="md">
      <Pagination value={page} onChange={setPage} total={Math.ceil(locations.data.total / PAGE_SIZE)}
        aria-label="儲存位置分頁" /></Group>}
  </>;

  return <Stack gap="lg" maw={1200} mx="auto" pb={phone && isAdmin ? 80 : undefined}>
    <Box className={classes.enter}>
      <PageHeader breadcrumb={phone ? undefined : ["基本資料", "儲存位置"]} icon={<MapPinIcon size={20} />}
        title="儲存位置" description={phone ? undefined : "管理冷藏庫、冷凍庫與常溫架，並查看每個位置目前存放的批次。"}
        actions={isAdmin && !phone && <Button leftSection={<PlusIcon size={18} />} onClick={create}>新增位置</Button>} />
    </Box>
    {success && <Alert color="green" role="status" withCloseButton onClose={() => setSuccess("")}>{success}</Alert>}
    <LocationSummary />

    {/* 手機不再多包一層外框，卡片直接貼齊頁面左右邊距。 */}
    {phone
      ? <Stack gap="md" className={classes.enter} style={stagger(0, 160)}>{filters}{content}</Stack>
      : <Paper radius="xl" shadow="md" p={0} className={`${classes.enter} ff-card`}
        style={{ ...stagger(0, 160), overflow: "hidden" }}>{filters}{content}</Paper>}

    {/* 手機的新增改為右下角浮動按鈕，與常見 App 一致。 */}
    {isAdmin && phone && <Affix position={{ bottom: 20, right: 20 }}>
      <ActionIcon size={56} radius="xl" variant="filled" aria-label="新增位置" onClick={create}
        style={{ boxShadow: "var(--mantine-shadow-lg)" }}>
        <PlusIcon size={26} />
      </ActionIcon>
    </Affix>}

    <FormModal opened={editing !== undefined} onClose={() => setEditing(undefined)}
      title={editing ? "編輯儲存位置" : "新增儲存位置"} busy={modalBusy} fullScreen={phone}>
      {editing !== undefined && <LocationForm key={editing?.id ?? "new"} location={editing}
        onSaved={done} onCancel={() => setEditing(undefined)} onBusy={setModalBusy} />}
    </FormModal>
    <FormModal opened={!!deleting} onClose={() => setDeleting(null)} title="刪除儲存位置"
      kind="confirm" busy={modalBusy} fullScreen={phone}>
      {deleting && <DeleteConfirm key={deleting.id} location={deleting} onDeleted={done}
        onCancel={() => setDeleting(null)} onBusy={setModalBusy} />}
    </FormModal>
    <FormModal opened={!!moving} onClose={() => setMoving(null)} title="整批換位置" busy={modalBusy} fullScreen={phone}>
      {moving && <MoveBatchForm key={moving.id} batch={moving} onSaved={done}
        onCancel={() => setMoving(null)} onBusy={setModalBusy} />}
    </FormModal>
  </Stack>;
}
