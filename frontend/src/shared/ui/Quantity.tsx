import { Text } from "@mantine/core";

/**
 * 後端數量字串（固定三位小數，AD-9）的顯示格式：去掉多餘的 0，小數部分縮小變淡，避免把 2.500 看成 2500。
 * 只處理字串，不做數量運算；送給後端的值不要經過這裡。
 *
 * ```tsx
 * <Quantity value="12.500" unit="公斤" />   // 12.5 公斤（.5 較小）
 * formatQuantity("30.000")                  // "30"
 * ```
 */
export function formatQuantity(value: string): string {
  if (!value.includes(".")) return value;
  const trimmed = value.replace(/0+$/, "");
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
}

export function Quantity({ value, unit, strong = true }: { value: string; unit?: string; strong?: boolean }) {
  const [whole, fraction] = formatQuantity(value).split(".");
  return <Text span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
    <Text span inherit fw={strong ? 700 : undefined}>{whole}</Text>
    {fraction && <Text span fz="0.8em" c="dimmed" fw={strong ? 600 : undefined}>.{fraction}</Text>}
    {unit && <Text span fz="xs" c="dimmed"> {unit}</Text>}
  </Text>;
}
