import { Paper, Stack, Title } from "@mantine/core";
import { AlertList } from "../../alerts/components/AlertList";

import { EmptyState } from "../../../shared/ui/EmptyState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { LayersIcon, ToolIcon } from "../../../shared/ui/icons";

export function InventoryPage() {
  return (
    <Stack gap="lg" maw={1200} mx="auto">
      <PageHeader icon={<LayersIcon size={20} />} title="庫存" description="此功能由 ChiaJungTien 負責，開發中" />
      <EmptyState framed icon={<ToolIcon size={24} />} title="功能開發中" description="對應需求：FR-08、FR-09" />
      <Paper p="md" radius="xl"><Stack><Title order={2} size="h3">全店低庫存預警</Title>
        <AlertList filters={{ status: "LOW_STOCK", locationId: "" }} lowStockOnly />
      </Stack></Paper>
    </Stack>
  );
}
