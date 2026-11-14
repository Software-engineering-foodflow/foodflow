import { Alert, Box, Button, Group, Loader, Notification, Pagination, Paper, Select, Skeleton, Stack, Table, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useCurrentEmployee } from "../../auth/hooks";
import { storageTypeLabels, storageTypeOptions } from "../../../shared/storageTypes";
import { ActiveBadge } from "../../../shared/ui/ActiveBadge";
import { CodeTag } from "../../../shared/ui/CodeTag";
import { DataTable } from "../../../shared/ui/DataTable";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { FormModal } from "../../../shared/ui/FormModal";
import { LeafIcon, PlusIcon, StoreIcon, TagIcon } from "../../../shared/ui/icons";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { StorageTypeIcon } from "../../../shared/ui/StorageTypeIcon";
import { SearchInput, Toolbar } from "../../../shared/ui/Toolbar";
import { PAGE_SIZE, type Filters, type Master, type Resource, useActiveMasters, useMasterMutation, useMasters } from "../hooks";
import classes from "../masterData.module.css";
import { MasterForm } from "./MasterForm";

const initial: Filters = { search: "", status: "", category: "", storage: "", page: 1 };
const config = {
  "ingredient-categories": { title: "食材分類", noun: "分類", description: "維護食材分類，整理餐廳的原料品項", Icon: TagIcon },
  ingredients: { title: "食材管理", noun: "食材", description: "維護食材、固定單位與安全庫存量", Icon: LeafIcon },
  suppliers: { title: "供應商", noun: "供應商", description: "維護供應商與聯絡資訊，供進貨登記選用", Icon: StoreIcon },
};

export function MasterDataPage({ resource }: { resource: Resource }) {
  const { title, noun, description, Icon } = config[resource];
  const admin = useCurrentEmployee().data?.role === "ADMIN";
  const phone = useMediaQuery("(max-width: 767px)");
  const cards = useMediaQuery("(max-width: 1279px)");
  const [filters, setFilters] = useState(initial);
  const data = useMasters(resource, filters);
  const categories = useActiveMasters("ingredient-categories", resource === "ingredients", false);
  const [editing, setEditing] = useState<Master | null | undefined>();
  const [deleting, setDeleting] = useState<Master | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const remove = useMasterMutation(resource);
  useEffect(() => {
    if (!data.data) return;
    const lastPage = Math.max(1, Math.ceil(data.data.total / PAGE_SIZE));
    setFilters(current => current.page > lastPage ? { ...current, page: lastPage } : current);
  }, [data.data]);
  useEffect(() => { if (!success) return; const timer = window.setTimeout(() => setSuccess(""), 4000); return () => window.clearTimeout(timer); }, [success]);
  const filtered = !!(filters.search.trim() || filters.status || filters.category || filters.storage);
  const change = (key: keyof Filters, value: string) => setFilters(f => ({ ...f, [key]: value, page: 1 }));
  function done(message: string) { setSuccess(message); setEditing(undefined); setDeleting(null); setFilters(f => ({ ...f, page: 1 })); }
  function actions(item: Master) { return admin && <Group gap={4} className={classes.actions}>
    <Button variant="default" aria-label={`編輯 ${item.name}`} onClick={() => setEditing(item)}>編輯</Button>
    <Button variant="default" aria-label={`刪除 ${item.name}`} onClick={() => { remove.reset(); setDeleting(item); }}>刪除</Button>
  </Group>; }
  function details(item: Master) {
    if ("code" in item) return <><CodeTag code={item.code} /><Text size="sm" c="dimmed">{item.description || "—"}</Text></>;
    if ("unit" in item) return <Group gap="md"><Text size="sm">{item.category_name} · {item.unit}</Text>
      <Group gap="xs"><StorageTypeIcon type={item.storage_method} size={28} muted={!item.is_active} /><Text size="sm">{storageTypeLabels[item.storage_method]}</Text></Group>
      <Text size="sm">安全庫存量 {item.safety_stock_quantity} {item.unit}</Text></Group>;
    return <><Text size="sm">聯絡人：{item.contact_person || "—"}</Text><Text size="sm">電話：{item.phone || "—"}</Text><Text size="sm">{item.other_contact || "—"}</Text></>;
  }
  const columns: { label: string; value: (item: Master) => ReactNode }[] = resource === "ingredient-categories" ? [
    { label: "分類代碼", value: item => "code" in item ? <CodeTag code={item.code} /> : null },
    { label: "說明", value: item => "description" in item ? item.description || "—" : null },
  ] : resource === "ingredients" ? [
    { label: "分類", value: item => "category_name" in item ? item.category_name : null },
    { label: "保存方式", value: item => "storage_method" in item ? <Group gap={6}><StorageTypeIcon type={item.storage_method} size={28} muted={!item.is_active} />{storageTypeLabels[item.storage_method]}</Group> : null },
    { label: "安全庫存量", value: item => "safety_stock_quantity" in item ? <Text ta="right" fw={600}>{item.safety_stock_quantity}</Text> : null },
    { label: "單位", value: item => "unit" in item ? item.unit : null },
  ] : [
    { label: "聯絡人", value: item => "contact_person" in item ? item.contact_person || "—" : null },
    { label: "電話", value: item => "phone" in item ? item.phone || "—" : null },
    { label: "其他聯絡資訊", value: item => "other_contact" in item ? item.other_contact || "—" : null },
  ];
  const filterControls = <>
    <Select label="狀態" data={[{ value: "", label: "全部狀態" }, { value: "true", label: "啟用" }, { value: "false", label: "停用" }]}
      value={filters.status} className={filters.status ? classes.filtered : undefined} onChange={v => change("status", v ?? "")} allowDeselect={false} />
    {resource === "ingredients" && <>
      <Select label="分類" data={[{ value: "", label: "全部分類" }, ...(categories.data ?? []).map(c => ({ value: String(c.id), label: c.name }))]}
        value={filters.category} className={filters.category ? classes.filtered : undefined} onChange={v => change("category", v ?? "")} allowDeselect={false} />
      <Select label="保存方式" data={[{ value: "", label: "全部保存方式" }, ...storageTypeOptions]} value={filters.storage}
        className={filters.storage ? classes.filtered : undefined} onChange={v => change("storage", v ?? "")} allowDeselect={false} />
    </>}
  </>;
  return <Stack gap="lg" maw={1200} mx="auto" style={{ minWidth: 0 }}>
    <PageHeader title={title} description={description} icon={<Icon size={20} />}
      actions={admin && <Button leftSection={<PlusIcon size={18} />} onClick={() => setEditing(null)}>新增{noun}</Button>} />
    {success && <Notification color="green" role="status" className={classes.notification} closeButtonProps={{ size: 44, "aria-label": "關閉通知" }} onClose={() => setSuccess("")}>{success}</Notification>}
    <Paper p={20} radius="xl" shadow="md" withBorder style={{ minWidth: 0, overflow: "hidden" }}><Stack gap="md">
      <Toolbar bleed={20} cols={{ base: 1, sm: 2, lg: resource === "ingredients" ? 4 : 2 }}>
        <SearchInput label={resource === "ingredient-categories" ? "搜尋代碼或名稱" : "搜尋名稱"} value={filters.search} onChange={e => change("search", e.currentTarget.value)} />
        {cards ? <Button variant="default" mt={{ sm: 27 }} onClick={() => setShowFilters(true)}>篩選</Button> : filterControls}
      </Toolbar>
      {filtered && <Button variant="subtle" onClick={() => setFilters(initial)}>清除篩選</Button>}
      {data.isPending && <Stack role="status" aria-label={`載入${noun}中`}>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={52} />)}</Stack>}
      {data.error && <Alert color="red" title={`無法載入${noun}`} role="alert"><Text>{data.error.message}</Text><Button variant="default" onClick={() => void data.refetch()}>重試</Button></Alert>}
      {categories.error && resource === "ingredients" && <Alert color="red">無法載入分類篩選<Button variant="default" onClick={() => void categories.refetch()}>重試分類</Button></Alert>}
      {data.data && <>
        <Group justify="space-between"><Text size="sm" c="dimmed">共 {data.data.total} 筆{noun}</Text>{data.isFetching && <Loader size="xs" aria-label="更新資料中" />}</Group>
        {data.data.items.length === 0 ? <EmptyState title={filtered ? `沒有符合條件的${noun}` : `還沒有${noun}`} description={filtered ? "請調整搜尋條件，或清除篩選。" : `新增第一筆${noun}，供後續作業使用。`}
          action={filtered ? <Button variant="default" onClick={() => setFilters(initial)}>清除篩選</Button> : admin ? <Button variant="default" onClick={() => setEditing(null)}>新增第一筆{noun}</Button> : undefined} /> : <>
          {!cards && <Box className={classes.table}><DataTable label={title} head={<><Table.Th>名稱</Table.Th>{columns.map(column => <Table.Th key={column.label} w={column.label === "單位" ? 58 : column.label === "保存方式" || column.label === "安全庫存量" ? 110 : undefined}>{column.label}</Table.Th>)}<Table.Th w={80}>狀態</Table.Th>{admin && <Table.Th w={170}>操作</Table.Th>}</>}>
            {data.data.items.map(item => <Table.Tr key={item.id} className={item.is_active ? undefined : classes.inactive}>
              <Table.Td className={classes.name}><Text fw={700}>{item.name}</Text></Table.Td>{columns.map(column => <Table.Td className={classes.name} key={column.label}>{column.value(item)}</Table.Td>)}
              <Table.Td><ActiveBadge active={item.is_active} /></Table.Td>{admin && <Table.Td>{actions(item)}</Table.Td>}
            </Table.Tr>)}
          </DataTable></Box>}
          {cards && <Box><Stack gap="sm">{data.data.items.map(item => <Paper key={item.id} component="article" withBorder p="md" radius="lg" className={`${classes.name} ${item.is_active ? "" : classes.inactive}`}>
            <Stack gap="sm"><Group justify="space-between" align="center"><Text fw={700}>{item.name}</Text><Group gap="xs"><ActiveBadge active={item.is_active} />{!phone && actions(item)}</Group></Group>{details(item)}{phone && actions(item)}</Stack>
          </Paper>)}</Stack></Box>}
        </>}
        {data.data.total > PAGE_SIZE && <Group justify="center"><Pagination styles={{ control: { minWidth: 44, height: 44 } }} getControlProps={control => ({ "aria-label": { previous: "上一頁", next: "下一頁", first: "第一頁", last: "最後一頁" }[control] })} total={Math.ceil(data.data.total / PAGE_SIZE)} value={filters.page} onChange={page => setFilters(f => ({ ...f, page }))} aria-label={`${noun}分頁`} /></Group>}
      </>}
    </Stack></Paper>
    <FormModal opened={showFilters} title="篩選" onClose={() => setShowFilters(false)}><Stack>{filterControls}<Button onClick={() => setShowFilters(false)}>關閉篩選</Button></Stack></FormModal>
    <FormModal opened={editing !== undefined} title={`${editing ? "編輯" : "新增"}${noun}`} busy={busy} fullScreen={phone} onClose={() => setEditing(undefined)}>
      {editing !== undefined && <MasterForm key={editing?.id ?? "new"} resource={resource} record={editing} onSaved={done} onCancel={() => setEditing(undefined)} onBusy={setBusy} />}
    </FormModal>
    <FormModal opened={!!deleting} title={`刪除 ${deleting?.name}？`} busy={remove.isPending} kind="confirm" onClose={() => setDeleting(null)}>
      <Stack><Text>刪除後無法復原；有歷史引用的資料不能刪除。</Text>{remove.error && <Alert color="red" role="alert">{remove.error.message}</Alert>}
        <Group justify="flex-end"><Button variant="default" disabled={remove.isPending} onClick={() => setDeleting(null)}>取消</Button>
          <Button color="red" loading={remove.isPending} onClick={() => deleting && remove.mutate({ deleteId: deleting.id }, { onSuccess: () => done(`${deleting.name} 已刪除`) })}>確認刪除</Button></Group>
      </Stack>
    </FormModal>
  </Stack>;
}
