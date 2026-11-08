import { Box, SimpleGrid, TextInput, type SimpleGridProps, type TextInputProps } from "@mantine/core";
import type { ReactNode } from "react";

import { SearchIcon } from "./icons";

interface ToolbarProps {
  children: ReactNode;
  /** 欄數，同 SimpleGrid 的 `cols`；預設手機 2 欄、平板以上 3 欄。 */
  cols?: SimpleGridProps["cols"];
  spacing?: SimpleGridProps["spacing"];
  /**
   * 放在主卡片頂部時傳入卡片的內距（px），工具列會貼齊卡片邊緣並加上淡漸層與分隔線。
   * 不傳時只排版、不加底色（例如手機版沒有外框時）。
   */
  bleed?: number;
  /**
   * 單列無標籤模式：搜尋框佔滿剩餘寬度、篩選固定約 150px，排成一列。
   * 放在內距為 0 的主卡片頂部，自帶 16px 內距、淡漸層與分隔線；忽略 `cols` 與 `bleed`。
   * 欄位沒有看得見的 label，呼叫端一定要給 `aria-label`。
   */
  row?: boolean;
}

/**
 * 主卡片頂部的工具列（DESIGN.md › 工具列）：搜尋框 → 篩選下拉。
 * 頁面層級的主要按鈕放在 PageHeader，不在工具列重複放。
 *
 * ```tsx
 * <Paper p={20}>
 *   <Toolbar bleed={20}>
 *     <SearchInput label="搜尋代碼或名稱" value={search} onChange={…} />
 *     <Select label="儲存類型" data={[{ value: "", label: "全部類型" }, …]} … />
 *   </Toolbar>
 *   …
 * </Paper>
 * ```
 *
 * 單列模式（主卡片 `p={0}`）：
 *
 * ```tsx
 * <Toolbar row>
 *   <SearchInput aria-label="搜尋代碼或名稱" placeholder="搜尋代碼或名稱" … />
 *   <Select aria-label="儲存類型" … />
 * </Toolbar>
 * ```
 */
export function Toolbar({ children, cols = { base: 2, sm: 3 }, spacing = "md", bleed, row = false }: ToolbarProps) {
  if (row) return <Box className="ff-toolbar ff-toolbar-row" p="md">{children}</Box>;
  const grid = <SimpleGrid cols={cols} spacing={spacing}>{children}</SimpleGrid>;
  if (bleed === undefined) return grid;
  return <Box className="ff-toolbar" mx={-bleed} mt={-bleed} px={bleed} pt={bleed} pb="md"
    style={{ borderRadius: "var(--mantine-radius-xl) var(--mantine-radius-xl) 0 0" }}>{grid}</Box>;
}

/**
 * 工具列的搜尋框：左側 18px 搜尋圖示，預設最多 100 字。一定要有 label（或 aria-label），不可只靠 placeholder。
 *
 * ```tsx
 * <SearchInput label="搜尋帳號或姓名" placeholder="輸入關鍵字" value={search} onChange={…} />
 * ```
 */
export function SearchInput(props: TextInputProps) {
  return <TextInput maxLength={100} leftSection={<SearchIcon size={18} />} {...props} />;
}
