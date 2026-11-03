import { describe, expect, it } from "vitest";

import { cn } from "../../../src/lib/cn.js";

describe("cn", () => {
  it("merges conflicting Tailwind utilities", () => {
    expect(cn("px-4", "px-8")).toBe("px-8");
  });

  it("supports conditional class names", () => {
    const isHidden = false;
    const isCentered = true;

    expect(
      cn("flex", {
        hidden: isHidden,
        "items-center": isCentered,
      }),
    ).toBe("flex items-center");
  });

  it("ignores null and undefined values", () => {
    expect(cn("flex", null, undefined, "gap-2")).toBe("flex gap-2");
  });
});
