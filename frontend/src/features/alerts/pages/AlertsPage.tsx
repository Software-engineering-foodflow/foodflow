import { Button, Group, Paper, Select, SimpleGrid, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { Toolbar } from "../../../shared/ui/Toolbar";
import { statusBadgeMap } from "../../../shared/ui/statusBadgeMap";
import { BellIcon } from "../../../shared/ui/icons";
import { useCurrentEmployee } from "../../auth/hooks";
import { AlertList } from "../components/AlertList";
import { AlertSettings } from "../components/AlertSettings";
import { useAlertLocations, useAlerts, type AlertFilters, type AlertStatus } from "../hooks";

const statuses: AlertStatus[] = ["EXPIRED", "EXPIRES_TODAY", "EXPIRING_SOON", "LOW_STOCK"];
export function AlertsPage() {
  const [filters, setFilters] = useState<AlertFilters>({ status: "", locationId: "" });
  const [settings, setSettings] = useState(false);
  const employee = useCurrentEmployee();
  const locations = useAlertLocations();
  const query = useAlerts(filters);
  return <Stack gap={20} maw={1200} mx="auto">
    <PageHeader icon={<BellIcon size={20} />} title="預警首頁" description="依處理優先順序，核對效期與全店低庫存。"
      actions={employee.data?.role === "ADMIN" && <Button variant="default" onClick={() => setSettings(true)}>預警設定</Button>} />
    <SimpleGrid cols={{ base: 2, md: 4 }}>{statuses.map(status => <Paper key={status} p="md" radius="xl" shadow="xs" bg="var(--ff-surface-raised)">
      <Group gap="xs"><Text size="xl" fw={800}>{query.data ? query.data.items.filter(item => item.status === status).length : "—"}</Text>
        <Text fw={700}>{statusBadgeMap[status].label}</Text></Group>
      <Text size="xs" c="dimmed">目前篩選範圍</Text>
    </Paper>)}</SimpleGrid>
    <Paper p={20} radius="xl" shadow="md" style={{ overflow: "hidden" }}>
      <Stack><Toolbar bleed={20} cols={{ base: 1, sm: 3 }}>
        <Select label="預警狀態" value={filters.status} allowDeselect={false}
          data={[{ value: "", label: "全部狀態" }, ...statuses.map(value => ({ value, label: statusBadgeMap[value].label }))]}
          onChange={value => setFilters({ ...filters, status: (value ?? "") as AlertStatus | "" })} />
        <Select label="儲存位置" value={filters.locationId} allowDeselect={false}
          data={[{ value: "", label: "全部位置" }, ...(locations.data ?? []).map(item => ({ value: String(item.id), label: item.name }))]}
          onChange={value => setFilters({ ...filters, locationId: value ?? "" })} />
        <Group align="flex-end"><Button variant="default" loading={query.isFetching} onClick={() => void query.refetch()}>重新整理</Button>
          {(filters.status || filters.locationId) && <Button variant="default" onClick={() => setFilters({ status: "", locationId: "" })}>清除篩選</Button>}</Group>
      </Toolbar>
      {locations.error && <Text c="red" role="alert">無法載入位置篩選<Button variant="default" onClick={() => void locations.refetch()}>重試</Button></Text>}
      <AlertList filters={filters} /></Stack>
    </Paper>
    {settings && <AlertSettings opened onClose={() => setSettings(false)} />}
  </Stack>;
}
