import { Button, MantineProvider, Table } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { theme } from "../../app/theme";
import { ActiveBadge } from "./ActiveBadge";
import { CodeTag } from "./CodeTag";
import { DataTable } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { FormModal } from "./FormModal";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";
import { StorageTypeIcon } from "./StorageTypeIcon";
import { SearchInput, Toolbar } from "./Toolbar";
import { MapPinIcon } from "./icons";

function renderUi(ui: ReactNode) {
  return render(<MantineProvider theme={theme} env="test">{ui}</MantineProvider>);
}

describe("StatusBadge", () => {
  it.each([
    ["EXPIRED", "過期"], ["EXPIRES_TODAY", "今日到期"], ["LOW_STOCK", "低庫存"],
  ] as const)("shows %s as a strong badge with a dot and filled background", (status, label) => {
    renderUi(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge.getAttribute("data-tone")).toBe("strong");
    expect(badge.querySelector("[data-dot]")).toBeTruthy();
    expect(badge.style.background).not.toBe("transparent");
  });

  it("shows EXPIRING_SOON with only a dot", () => {
    renderUi(<StatusBadge status="EXPIRING_SOON" />);
    const badge = screen.getByText("即期");
    expect(badge.getAttribute("data-tone")).toBe("medium");
    expect(badge.querySelector("[data-dot]")).toBeTruthy();
    expect(badge.style.background).toBe("transparent");
  });

  it("shows NORMAL as gray text without a dot", () => {
    renderUi(<StatusBadge status="NORMAL" />);
    const badge = screen.getByText("正常");
    expect(badge.getAttribute("data-tone")).toBe("weak");
    expect(badge.querySelector("[data-dot]")).toBeNull();
  });

  it("starts with the status word when a detail is given", () => {
    renderUi(<StatusBadge status="EXPIRED" detail="1 天" />);
    expect(screen.getByText("過期 1 天")).toBeTruthy();
  });

  it.each([
    ["EXPIRED", -1, "過期 1 天", "strong"],
    ["EXPIRES_TODAY", 0, "今日到期", "strong"],
    ["EXPIRING_SOON", 2, "即期 · 剩 2 天", "medium"],
    ["NORMAL", 5, "剩 5 天", "weak"],
  ] as const)("formats %s with %i days from the backend", (status, days, text, tone) => {
    renderUi(<StatusBadge status={status} days={days} />);
    expect(screen.getByText(text).getAttribute("data-tone")).toBe(tone);
  });
});

describe("ActiveBadge", () => {
  it.each([[true, "啟用"], [false, "停用"]] as const)("shows text for active=%s", (active, label) => {
    renderUi(<ActiveBadge active={active} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

describe("CodeTag", () => {
  it("shows the code in the monospace font", () => {
    renderUi(<CodeTag code="R-01" />);
    expect(screen.getByText("R-01")).toBeTruthy();
  });
});

describe("StorageTypeIcon", () => {
  it("is decorative and carries the storage type", () => {
    const { container } = renderUi(<StorageTypeIcon type="FROZEN" />);
    const icon = container.querySelector("[data-storage-type]")!;
    expect(icon.getAttribute("data-storage-type")).toBe("FROZEN");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("PageHeader icon", () => {
  it("keeps the h1 name to the title when an icon is shown", () => {
    renderUi(<PageHeader icon={<MapPinIcon />} title="儲存位置" description="說明" />);
    expect(screen.getByRole("heading", { level: 1, name: "儲存位置" })).toBeTruthy();
    expect(screen.getByText("說明")).toBeTruthy();
  });
});

describe("PageHeader breadcrumb", () => {
  it("shows the trail above the title joined by slashes", () => {
    renderUi(<PageHeader breadcrumb={["基本資料", "儲存位置"]} title="儲存位置" />);
    expect(screen.getByRole("navigation", { name: "麵包屑" }).textContent).toBe("基本資料 / 儲存位置");
    expect(screen.getByRole("heading", { level: 1, name: "儲存位置" })).toBeTruthy();
  });
});

describe("EmptyState", () => {
  it("shows title, description and action", () => {
    renderUi(<EmptyState title="功能開發中" description="對應需求：FR-04" framed
      action={<Button variant="default">清除篩選</Button>} />);
    expect(screen.getByRole("heading", { level: 2, name: "功能開發中" })).toBeTruthy();
    expect(screen.getByText("對應需求：FR-04")).toBeTruthy();
    expect(screen.getByRole("button", { name: "清除篩選" })).toBeTruthy();
  });

  it("uses the requested heading level", () => {
    renderUi(<EmptyState title="還沒有資料" order={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "還沒有資料" })).toBeTruthy();
  });
});

describe("DataTable", () => {
  it("renders the head and caller rows with an accessible name", () => {
    renderUi(<DataTable label="R-01 的批次" head={<><Table.Th>食材</Table.Th><Table.Th>批號</Table.Th></>}>
      <Table.Tr><Table.Td>雞胸肉</Table.Td><Table.Td>B-1</Table.Td></Table.Tr>
    </DataTable>);
    const table = screen.getByRole("table", { name: "R-01 的批次" });
    expect(table.querySelectorAll("th")).toHaveLength(2);
    expect(screen.getByText("雞胸肉")).toBeTruthy();
  });

  it("drops the outer frame in flush mode", () => {
    const { container } = renderUi(<DataTable flush label="位置" head={<Table.Th>代碼</Table.Th>}>
      <Table.Tr><Table.Td>R-01</Table.Td></Table.Tr>
    </DataTable>);
    expect(screen.getByRole("table", { name: "位置" })).toBeTruthy();
    expect(container.querySelector(".mantine-Paper-root")).toBeNull();
  });
});

describe("Toolbar", () => {
  it("lays out a labelled search input and filters", () => {
    const onChange = vi.fn();
    renderUi(<Toolbar bleed={20}><SearchInput label="搜尋代碼或名稱" value="" onChange={onChange} /></Toolbar>);
    const input = screen.getByLabelText("搜尋代碼或名稱") as HTMLInputElement;
    expect(input.maxLength).toBe(100);
    fireEvent.change(input, { target: { value: "R" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("puts unlabelled controls in one row in row mode", () => {
    const { container } = renderUi(<Toolbar row>
      <SearchInput aria-label="搜尋代碼或名稱" placeholder="搜尋代碼或名稱" value="" onChange={() => {}} />
    </Toolbar>);
    expect(screen.getByLabelText("搜尋代碼或名稱")).toBeTruthy();
    expect(container.querySelector(".ff-toolbar-row")).toBeTruthy();
    expect(container.querySelector("label")).toBeNull();
  });
});

describe("FormModal", () => {
  const modal = (busy: boolean, onClose = vi.fn(), closeOnClickOutside?: boolean) => {
    renderUi(<FormModal opened title="編輯儲存位置" busy={busy} onClose={onClose}
      closeOnClickOutside={closeOnClickOutside}><p>內容</p></FormModal>);
    return onClose;
  };
  const clickOverlay = () => {
    const overlay = document.querySelector(".mantine-Modal-overlay")!;
    expect(overlay).toBeTruthy();
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
  };

  it("does not close on overlay click by default", async () => {
    const onClose = modal(false);
    await screen.findByRole("dialog", { name: "編輯儲存位置" });
    clickOverlay();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close on overlay click while busy even when outside clicks are allowed", async () => {
    const onClose = modal(true, vi.fn(), true);
    await screen.findByRole("dialog", { name: "編輯儲存位置" });
    clickOverlay();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes with Escape and shows the close button when idle", async () => {
    const onClose = modal(false);
    const dialog = await screen.findByRole("dialog", { name: "編輯儲存位置" });
    expect(dialog.querySelector(".mantine-Modal-close")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open on Escape and overlay click and hides the close button while busy", async () => {
    const onClose = modal(true);
    const dialog = await screen.findByRole("dialog", { name: "編輯儲存位置" });
    expect(dialog.querySelector(".mantine-Modal-close")).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    clickOverlay();
    expect(onClose).not.toHaveBeenCalled();
  });
});
