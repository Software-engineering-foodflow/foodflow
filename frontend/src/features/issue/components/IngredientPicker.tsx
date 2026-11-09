import {
  Button, Combobox, Group, InputBase, ScrollArea, Stack, Text, useCombobox,
} from "@mantine/core";
import { useMemo, useState } from "react";

import { storageTypeLabels } from "../../../shared/storageTypes";
import { formatQuantity } from "../../../shared/ui/Quantity";
import { StatusBadge } from "../../../shared/ui/StatusBadge";
import { StorageTypeIcon } from "../../../shared/ui/StorageTypeIcon";
import type { IssuableIngredient } from "../hooks";
import { motion } from "../motion";

const ALL_CATEGORIES = "all";

/** 只有過期、今日到期、即期與低庫存才標出來；正常不加標籤，避免整份清單都是顏色。 */
function IngredientBadges({ item }: { item: IssuableIngredient }) {
  const expiry = item.nearest_expiry_status;
  return <Group gap={6} wrap="nowrap">
    {expiry !== "NORMAL" && <StatusBadge status={expiry} />}
    {item.is_low_stock && <StatusBadge status="LOW_STOCK" />}
    {!item.is_active && <Text span size="xs" c="dimmed">已停用</Text>}
  </Group>;
}

/**
 * 領用頁的食材選擇：可搜尋的下拉，分類篩選放在下拉頂端，打開清單後可以直接換分類而不關閉。
 * 每個選項顯示保存方式、可用量與後端判定的效期／低庫存狀態（AD-11、AD-21）。
 */
export function IngredientPicker({ items, value, onChange, error }: {
  items: IssuableIngredient[];
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
}) {
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const combobox = useCombobox({
    onDropdownClose: () => { combobox.resetSelectedOption(); setTyping(false); setSearch(""); },
  });

  const byId = useMemo(() => new Map(items.map((item) => [String(item.id), item])), [items]);
  const categories = useMemo(() => {
    const seen = new Map<number, string>();
    for (const item of items) seen.set(item.category_id, item.category_name);
    return [...seen].map(([id, name]) => ({ id: String(id), name }));
  }, [items]);

  const groups = useMemo(() => {
    const keyword = typing ? search.trim() : "";
    const result = new Map<string, IssuableIngredient[]>();
    for (const item of items) {
      if (category !== ALL_CATEGORIES && String(item.category_id) !== category) continue;
      if (keyword && !item.name.includes(keyword)) continue;
      const group = result.get(item.category_name) ?? [];
      group.push(item);
      result.set(item.category_name, group);
    }
    return [...result];
  }, [items, category, search, typing]);

  const selected = value ? byId.get(value) : undefined;

  // 固定在輸入框下方：關掉 flip，捲動時清單不會跳到輸入框上面；空間不夠就在清單內捲動。
  return <Combobox store={combobox} withinPortal position="bottom-start"
    middlewares={{ flip: false, shift: true }} transitionProps={{ transition: "pop-top-left", duration: 160 }}
    onOptionSubmit={(next) => { onChange(next); combobox.closeDropdown(); }}>
    <Combobox.Target withExpandedAttribute>
      <InputBase label="食材" required error={error} placeholder="搜尋食材名稱"
        // 與「需要數量」等輸入框同高（主題只替 TextInput、Select 設了 44px）。
        styles={{ input: { minHeight: 44 } }}
        inputWrapperOrder={["label", "input", "description", "error"]}
        value={typing ? search : selected?.name ?? ""}
        onChange={(event) => {
          setTyping(true);
          setSearch(event.currentTarget.value);
          combobox.openDropdown();
          combobox.updateSelectedOptionIndex();
        }}
        onClick={() => combobox.openDropdown()}
        onFocus={() => combobox.openDropdown()}
        onBlur={() => combobox.closeDropdown()}
        rightSection={<Combobox.Chevron />} rightSectionPointerEvents="none"
        leftSection={selected ? <StorageTypeIcon type={selected.storage_method} size={28} /> : undefined}
        leftSectionWidth={selected ? 44 : undefined}
        description={selected
          ? `${storageTypeLabels[selected.storage_method]}・可用 ${formatQuantity(selected.available_quantity)} ${selected.unit}`
          : undefined} />
    </Combobox.Target>

    <Combobox.Dropdown>
      {categories.length > 1 && <Combobox.Header>
        {/* 用一般按鈕而不是 Chip：Chip 底層是 label＋radio，點下去瀏覽器會把焦點移到 radio，
            輸入框 blur 就會關掉清單。按鈕在 mousedown 時 preventDefault，焦點留在輸入框。 */}
        <Group gap="xs" role="group" aria-label="依分類篩選食材" py={4}>
          {[{ id: ALL_CATEGORIES, name: "全部" }, ...categories].map((item) => {
            const active = item.id === category;
            return <Button key={item.id} size="compact-md" mih={44} radius="xl" className={motion.press}
              variant={active ? "light" : "default"} color={active ? "forest" : "gray"} aria-pressed={active}
              onMouseDown={(event) => event.preventDefault()} onClick={() => setCategory(item.id)}>
              {item.name}
            </Button>;
          })}
        </Group>
      </Combobox.Header>}
      <Combobox.Options>
        <ScrollArea.Autosize mah={360} type="scroll">
          {groups.length === 0
            ? <Combobox.Empty>沒有符合的食材</Combobox.Empty>
            : groups.map(([group, options]) => <Combobox.Group key={group} label={group}>
              {options.map((item) => <Combobox.Option key={item.id} value={String(item.id)}
                active={String(item.id) === value} aria-label={item.name}>
                <Group gap="sm" wrap="nowrap" w="100%" data-ingredient={item.name}>
                  <StorageTypeIcon type={item.storage_method} size={28} muted={!item.is_active} />
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={700} c={item.is_active ? undefined : "dimmed"}>{item.name}</Text>
                    <Text size="xs" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {storageTypeLabels[item.storage_method]}・可用 {formatQuantity(item.available_quantity)} {item.unit}
                    </Text>
                  </Stack>
                  <IngredientBadges item={item} />
                </Group>
              </Combobox.Option>)}
            </Combobox.Group>)}
        </ScrollArea.Autosize>
      </Combobox.Options>
    </Combobox.Dropdown>
  </Combobox>;
}
