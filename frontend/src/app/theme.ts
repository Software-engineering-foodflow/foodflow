/**
 * 全站主題：docs/design/DESIGN.md 的 token 只在這裡寫成 hex（另見 theme.css）。
 * 元件取色一律用 Mantine 色票名稱（例如 `forest.8`、`expired.8`）或 `--ff-*` CSS 變數。
 */
import {
  Alert, Badge, Button, Modal, NavLink, Paper, PasswordInput, Select, Table, TextInput, ThemeIcon,
  createTheme, defaultVariantColorsResolver, parseThemeColor, rem,
  type CSSVariablesResolver, type MantineColorsTuple, type VariantColorsResolver,
} from "@mantine/core";

/** 由淺到深產生 10 階色票：index 0 是淺底、index 8 是主色、index 9 再深一階。 */
function ramp(light: string, main: string, dark: string): MantineColorsTuple {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (from: string, to: string, t: number) => `#${rgb(from)
    .map((value, i) => Math.round(value + (rgb(to)[i] - value) * t).toString(16).padStart(2, "0")).join("")}`;
  const steps = [0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9].map((t) => mix(light, main, t));
  return [light, ...steps, main, dark] as unknown as MantineColorsTuple;
}

/** DESIGN.md 的色彩 token；`--ff-*` 變數與 Mantine 色票都從這裡來。 */
export const tokens = {
  text: "#1f2a24",
  textMuted: "#5d6a61",
  textSubtle: "#64746a",
  textPlaceholder: "#7d8a81",
  textDisabled: "#9aa39d",
  surface: "#ffffff",
  surfaceRaised: "#ffffffc7",
  surfaceSubtle: "#fbfcf9",
  surfaceHeader: "#f6f9f3",
  surfaceSelected: "#f1f7ed",
  canvasTop: "#f4f8f3",
  canvasMid: "#f9fbf7",
  canvasBottom: "#ffffff",
  line: "#e3eadf",
  lineSoft: "#eff3ec",
  lineSelected: "#dfeada",
  lineNested: "#d7e6d2",
  lineSecondary: "#d6e5d6",
  borderInput: "#849788",
  codeBg: "#edf3e8",
  codeFg: "#3e5a45",
  sidebarTop: "#eaf2e8",
  sidebarMid: "#f1f7ee",
  sidebarBottom: "#fbfdf9",
  sidebarFg: "#3b4e42",
  sidebarMuted: "#4f6a58",
  sidebarIcon: "#6f8a79",
  accent: "#b7c94f",
  accentDeep: "#7da84a",
  onAccent: "#2b3410",
  primary700: "#2f805a",
  primary800: "#236e4b",
  primary900: "#145f3e",
  primary950: "#0d4a2f",
  focusRing: "#2f805a",
  successBg: "#e9f4ec",
  inactiveBg: "#f0f1ef",
} as const;

const forest: MantineColorsTuple = [
  "#edf7f0", "#d7eade", "#b1d5bf", "#87bfa0", "#64ab85", "#4b9e74", "#3d936b", "#2f805a", "#236e4b", "#145f3e",
];

/** 中性色（由淺到深）：0 表頭底、2 列分隔、3 框線、5 停用字、6 次要字（dimmed）、9 內文。 */
const gray: MantineColorsTuple = [
  "#f6f9f3", "#f2f6ef", "#eff3ec", "#e3eadf", "#c9d5cb", "#9aa39d", "#5d6a61", "#4a564e", "#3b4e42", "#1f2a24",
];

// 過期與危險、今日到期與 orange 共用同一組色票，各只定義一次。
const red = ramp("#fbe9e7", "#b3361f", "#8f2a17");
const orange = ramp("#fdf0e2", "#a54e0e", "#843e0b");
const green = ramp("#e9f4ec", "#2a7a4f", "#1f5e3c");

export const theme = createTheme({
  primaryColor: "forest",
  // 系統設定「減少動態」時略過 Mantine 元件的轉場（下拉選單、選單、對話框）。
  respectReducedMotion: true,
  // 實心元件用 index 8（#236E4B，白字 6.17:1），淺色變體的文字也用 index 8。
  primaryShade: { light: 8, dark: 8 },
  colors: {
    forest,
    gray,
    red,
    orange,
    green,
    // 狀態色：index 0 是底、index 8 是文字（DESIGN.md › 狀態色）。
    expired: red,
    today: orange,
    soon: ramp("#f8f3dc", "#8a6d0b", "#6b5408"),
    lowStock: ramp("#eeebf8", "#5b4fa8", "#473d87"),
    normal: ramp("#e5f2e9", "#2a7a4f", green[9]),
    // 保存方式：只用在圖示方塊（index 0 圖示底、index 8 圖示色）。
    chilled: ramp("#e2f1ec", "#2b8577", "#20665b"),
    frozen: ramp("#e7eef4", "#467596", "#365b75"),
    ambient: ramp("#f1f4da", "#7a8a24", "#5d6a1b"),
  },
  black: tokens.text,
  white: tokens.surface,
  defaultRadius: "md",
  fontFamily: '"Noto Sans TC", system-ui, sans-serif',
  fontFamilyMonospace: '"JetBrains Mono", ui-monospace, monospace',
  headings: {
    fontFamily: '"Noto Sans TC", system-ui, sans-serif',
    fontWeight: "700",
    sizes: {
      h1: { fontSize: rem(28), fontWeight: "900", lineHeight: "1.25" },
      h2: { fontSize: rem(18), fontWeight: "700", lineHeight: "1.4" },
      h3: { fontSize: rem(16), fontWeight: "700", lineHeight: "1.4" },
      h4: { fontSize: rem(16), fontWeight: "700", lineHeight: "1.4" },
    },
  },
  // caption 12、label 13、body 14、title 18（DESIGN.md › Typography）。
  fontSizes: { xs: rem(12), sm: rem(13), md: rem(14), lg: rem(16), xl: rem(18) },
  lineHeights: { xs: "1.45", sm: "1.4", md: "1.5", lg: "1.5", xl: "1.4" },
  spacing: { xs: rem(8), sm: rem(12), md: rem(16), lg: rem(20), xl: rem(32) },
  radius: { xs: rem(6), sm: rem(8), md: rem(10), lg: rem(12), xl: rem(16) },
  // 帶綠色調、向下偏移、負擴散的柔光；xs/sm 浮起，md 主卡片，lg/xl 覆蓋層。
  shadows: {
    xs: "0 8px 24px -18px rgba(35, 90, 55, 0.45)",
    sm: "0 8px 22px -14px rgba(35, 90, 55, 0.45)",
    md: "0 14px 40px -28px rgba(35, 90, 55, 0.45)",
    lg: "0 24px 60px -24px rgba(20, 60, 40, 0.45)",
    xl: "0 24px 60px -24px rgba(20, 60, 40, 0.45)",
  },
  variantColorResolver: resolveVariantColors(),
  components: {
    Button: Button.extend({
      defaultProps: { mih: 44, radius: "lg" },
      // 主要按鈕（實心＋主色）改用漸層與色光陰影；危險等其他顏色維持實心。
      vars: (_theme, props) => isPrimaryFilled(props.variant, props.color)
        ? { root: { "--button-bg": "var(--ff-gradient-primary)", "--button-hover": tokens.primary900 } }
        : { root: {} },
      classNames: (_theme, props) => ({ root: isPrimaryFilled(props.variant, props.color) ? "ff-button-primary" : "" }),
    }),
    TextInput: TextInput.extend({ styles: { input: { minHeight: 44 } } }),
    PasswordInput: PasswordInput.extend({ styles: { input: { minHeight: 44 } } }),
    // 下拉選單展開時淡入並稍微放大，跟「⋯」選單一樣有動畫；系統設定減少動態時 Mantine 會略過。
    Select: Select.extend({
      defaultProps: { comboboxProps: { transitionProps: { transition: "pop", duration: 160 } } },
      styles: { input: { minHeight: 44 } },
    }),
    Modal: Modal.extend({
      defaultProps: {
        radius: "xl", shadow: "lg", padding: 24,
        overlayProps: { color: tokens.text, backgroundOpacity: 0.4 },
        closeButtonProps: { size: 44 },
      },
      styles: { title: { fontSize: rem(18), fontWeight: 700 } },
    }),
    Table: Table.extend({
      vars: () => ({ table: {
        "--table-border-color": "var(--ff-line-soft)",
        "--table-highlight-on-hover-color": "var(--ff-surface-subtle)",
      } }),
      styles: { th: {
        background: "var(--ff-surface-header)", color: "var(--ff-text-subtle)",
        fontSize: rem(12), fontWeight: 700, letterSpacing: "0.08em",
      } },
    }),
    Badge: Badge.extend({
      defaultProps: { radius: "xl" },
      styles: { root: { textTransform: "none", letterSpacing: 0, fontWeight: 700 } },
    }),
    Paper: Paper.extend({ defaultProps: { radius: "xl" } }),
    ThemeIcon: ThemeIcon.extend({ defaultProps: { radius: "md" } }),
    NavLink: NavLink.extend({
      defaultProps: { mih: 44 },
      classNames: { root: "ff-navlink", children: "ff-navlink-children" },
    }),
    Alert: Alert.extend({ defaultProps: { radius: "lg" } }),
  },
});

export function isPrimaryFilled(variant: string | undefined, color: string | undefined) {
  return (variant ?? "filled") === "filled" && (color === undefined || color === "forest");
}

/** 淺色變體（light）一律用色票的 index 0 當底、index 8 當字，對比照 DESIGN.md 驗過。 */
export function resolveVariantColors(): VariantColorsResolver {
  return (input) => {
    const base = defaultVariantColorsResolver(input);
    if (input.variant !== "light") return base;
    const parsed = parseThemeColor({ color: input.color ?? input.theme.primaryColor, theme: input.theme });
    if (!parsed.isThemeColor || parsed.shade !== undefined) return base;
    return {
      ...base,
      background: `var(--mantine-color-${parsed.color}-0)`,
      hover: `var(--mantine-color-${parsed.color}-1)`,
      color: `var(--mantine-color-${parsed.color}-8)`,
    };
  };
}

/** 輸出 `--ff-*` 變數（畫布、側欄、線條、表面、漸層），並調整 Mantine 的預設中性色。 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--ff-text": tokens.text,
    "--ff-text-muted": tokens.textMuted,
    "--ff-text-subtle": tokens.textSubtle,
    "--ff-text-placeholder": tokens.textPlaceholder,
    "--ff-text-disabled": tokens.textDisabled,
    "--ff-surface": tokens.surface,
    "--ff-surface-raised": tokens.surfaceRaised,
    "--ff-surface-subtle": tokens.surfaceSubtle,
    "--ff-surface-header": tokens.surfaceHeader,
    "--ff-surface-selected": tokens.surfaceSelected,
    "--ff-line": tokens.line,
    "--ff-line-soft": tokens.lineSoft,
    "--ff-line-selected": tokens.lineSelected,
    "--ff-line-nested": tokens.lineNested,
    "--ff-border-input": tokens.borderInput,
    "--ff-code-bg": tokens.codeBg,
    "--ff-code-fg": tokens.codeFg,
    "--ff-sidebar-fg": tokens.sidebarFg,
    "--ff-sidebar-muted": tokens.sidebarMuted,
    "--ff-sidebar-icon": tokens.sidebarIcon,
    "--ff-accent": tokens.accent,
    "--ff-on-accent": tokens.onAccent,
    "--ff-success-bg": tokens.successBg,
    "--ff-inactive-bg": tokens.inactiveBg,
    "--ff-focus-ring": tokens.focusRing,
    "--ff-canvas": `radial-gradient(700px 320px at 92% -40px, rgba(183, 201, 79, 0.11), transparent 70%), `
      + `linear-gradient(165deg, ${tokens.canvasTop}, ${tokens.canvasMid} 55%, ${tokens.canvasBottom})`,
    "--ff-sidebar": `linear-gradient(180deg, ${tokens.sidebarTop}, ${tokens.sidebarMid} 55%, ${tokens.sidebarBottom})`,
    "--ff-gradient-primary": `linear-gradient(135deg, ${tokens.primary900}, ${tokens.primary700})`,
    "--ff-gradient-primary-hover": `linear-gradient(135deg, ${tokens.primary950}, ${tokens.primary800})`,
    "--ff-gradient-nav": `linear-gradient(90deg, ${tokens.primary900}, ${tokens.primary700})`,
    "--ff-gradient-tile": `linear-gradient(135deg, ${tokens.primary900}, ${tokens.accentDeep})`,
    "--ff-gradient-toolbar": `linear-gradient(180deg, ${tokens.surface}, ${tokens.surfaceSubtle})`,
    "--ff-shadow-glow": "0 6px 14px -8px rgba(35, 110, 75, 0.7)",
    "--ff-focus-glow": "0 0 0 2px rgba(47, 128, 90, 0.25)",
  },
  light: {
    "--mantine-color-body": tokens.surface,
    "--mantine-color-text": tokens.text,
    "--mantine-color-placeholder": tokens.textPlaceholder,
    "--mantine-color-default-border": tokens.lineSecondary,
    "--mantine-color-default-color": tokens.primary900,
  },
  dark: {},
});
