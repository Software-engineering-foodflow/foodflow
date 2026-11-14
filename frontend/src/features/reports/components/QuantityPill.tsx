import { Badge, Tooltip } from '@mantine/core';
export function QuantityPill({ value, unit, label, color = 'forest', explanation }: { value: string; unit: string; label: string; color?: string; explanation?: string }) {
  const text = `${value.startsWith('-') || value === '0.000' ? '' : '+'}${value} ${unit}`;
  return <Tooltip events={{ hover: true, focus: true, touch: false }} label={explanation ?? `${label}：${text}`} withArrow><Badge tabIndex={0} size="lg" h="auto" py={6} radius={9999} variant="light" color={color} styles={{ label: { whiteSpace: "normal", wordBreak: "keep-all", overflow: "visible", textOverflow: "clip" } }} style={{ maxWidth: "100%", fontSize: 16, whiteSpace: 'normal', lineHeight: 1.5, textTransform: 'none' }}>● {label} {text}</Badge></Tooltip>;
}
