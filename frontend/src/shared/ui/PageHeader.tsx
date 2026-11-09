import { Box, Group, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** 放在右側的主要操作，例如「新增」按鈕；每頁只放一個主要按鈕。 */
  actions?: ReactNode;
  /** 標題左側 42px 漸層圖示方塊裡的圖示，建議用 icons.tsx 的 20px 圖示。 */
  icon?: ReactNode;
  /** 標題上方的麵包屑，例如 `["基本資料", "儲存位置"]`，以「 / 」分隔。 */
  breadcrumb?: string[];
}

/**
 * 各頁共用的標題列；每頁只放一個，作為該頁的 h1（DESIGN.md › 頁面標題列）。
 *
 * ```tsx
 * <PageHeader breadcrumb={["基本資料", "儲存位置"]} icon={<MapPinIcon size={20} />} title="儲存位置"
 *   description="一句話說明"
 *   actions={<Button leftSection={<PlusIcon size={18} />}>新增位置</Button>} />
 * ```
 */
export function PageHeader({ title, description, actions, icon, breadcrumb }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end" gap="md">
      <div style={{ minWidth: 0 }}>
        {breadcrumb && breadcrumb.length > 0 && <Text component="nav" aria-label="麵包屑" fz="xs" mb={4}
          style={{ color: "var(--ff-text-subtle)" }}>{breadcrumb.join(" / ")}</Text>}
        <Group gap={12} wrap="nowrap">
          {icon && <Box className="ff-icon-tile" w={42} h={42} style={{ borderRadius: "var(--mantine-radius-lg)" }}
            aria-hidden="true">{icon}</Box>}
          <Title order={1} style={{ letterSpacing: "0.01em" }}>{title}</Title>
        </Group>
        {description && <Text c="dimmed" mt={4} pl={icon ? 54 : undefined}>{description}</Text>}
      </div>
      {actions}
    </Group>
  );
}
