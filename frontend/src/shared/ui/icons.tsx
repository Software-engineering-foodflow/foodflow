import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

/** 線條圖示的共同外框；純裝飾，對輔助技術隱藏。 */
function Icon({ size = 18, children, ...props }: IconProps & { children: ReactNode }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{children}</svg>;
}

export const FridgeIcon = (props: IconProps) => <Icon {...props}>
  <rect x="5" y="3" width="14" height="18" rx="2" /><path d="M5 10h14M9 6v1.5M9 13v3" />
</Icon>;

export const SnowflakeIcon = (props: IconProps) => <Icon {...props}>
  <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
  <path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
</Icon>;

export const BoxIcon = (props: IconProps) => <Icon {...props}>
  <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" />
</Icon>;

export const MapPinIcon = (props: IconProps) => <Icon {...props}>
  <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.2" />
</Icon>;

export const SearchIcon = (props: IconProps) => <Icon {...props}>
  <circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.8-4.8" />
</Icon>;

export const PlusIcon = (props: IconProps) => <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>;

export const PencilIcon = (props: IconProps) => <Icon {...props}>
  <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="m13.5 8.5 3 3" />
</Icon>;

export const TrashIcon = (props: IconProps) => <Icon {...props}>
  <path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
</Icon>;

export const SwapIcon = (props: IconProps) => <Icon {...props}>
  <path d="M5 8h13l-3.5-3.5M19 16H6l3.5 3.5" />
</Icon>;

export const DotsIcon = (props: IconProps) => <Icon {...props}>
  <circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" />
  <circle cx="19" cy="12" r="1.2" fill="currentColor" />
</Icon>;

/* ── 導覽與頁首用圖示（18px 預設；頁首方塊用 20px）── */

export const BellIcon = (props: IconProps) => <Icon {...props}>
  <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" />
</Icon>;

export const LayersIcon = (props: IconProps) => <Icon {...props}>
  <path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" />
</Icon>;

export const TruckIcon = (props: IconProps) => <Icon {...props}>
  <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" />
</Icon>;

export const OutboxIcon = (props: IconProps) => <Icon {...props}>
  <path d="M4 14v5h16v-5" /><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
</Icon>;

export const ClipboardIcon = (props: IconProps) => <Icon {...props}>
  <rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12l2 2 4-4M9 17h6" />
</Icon>;

export const ChartIcon = (props: IconProps) => <Icon {...props}>
  <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />
</Icon>;

export const LeafIcon = (props: IconProps) => <Icon {...props}>
  <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" /><path d="M5 19 13 11" />
</Icon>;

export const TagIcon = (props: IconProps) => <Icon {...props}>
  <path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.4" />
</Icon>;

export const StoreIcon = (props: IconProps) => <Icon {...props}>
  <path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M5 9.5V20h14V9.5M10 20v-5h4v5" />
</Icon>;

export const FolderIcon = (props: IconProps) => <Icon {...props}>
  <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
</Icon>;

export const UsersIcon = (props: IconProps) => <Icon {...props}>
  <circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
  <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.3c2 .8 3.5 3 3.5 5.7" />
</Icon>;

export const LogoutIcon = (props: IconProps) => <Icon {...props}>
  <path d="M10 4H5v16h5" /><path d="M14 8l4 4-4 4M18 12H9" />
</Icon>;

export const ToolIcon = (props: IconProps) => <Icon {...props}>
  <path d="M14.5 5.5a4 4 0 0 0 4.9 4.9L11 18.8a2.1 2.1 0 0 1-3-3l8.4-8.4" /><path d="M14.5 5.5 17 3l4 4-2.5 2.5" />
</Icon>;

export const SproutIcon = (props: IconProps) => <Icon {...props}>
  <path d="M12 21v-9" /><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z" />
</Icon>;

/** 側欄收合與展開。 */
export const SidebarIcon = (props: IconProps) => <Icon {...props}>
  <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
</Icon>;
