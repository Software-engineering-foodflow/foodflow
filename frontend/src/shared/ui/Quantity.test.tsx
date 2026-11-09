import { MantineProvider } from "@mantine/core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Quantity, formatQuantity } from "./Quantity";

describe("formatQuantity", () => {
  it.each([
    ["30.000", "30"], ["2.500", "2.5"], ["0.250", "0.25"], ["0.001", "0.001"], ["12", "12"], ["10.000", "10"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatQuantity(value)).toBe(expected);
  });
});

describe("Quantity", () => {
  it("renders the fraction separately so it can be smaller", () => {
    const { getByTestId } = render(<MantineProvider env="test"><div data-testid="q"><Quantity value="12.500" unit="公斤" /></div></MantineProvider>);
    const container = getByTestId("q");
    expect(container.textContent).toBe("12.5 公斤");
    const spans = [...container.querySelectorAll("span span")].map((item) => item.textContent);
    expect(spans).toContain(".5");
  });
});
