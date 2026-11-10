import { describe, expect, it } from "vitest";

import { buttonVariants } from "../../../../src/index.js";

describe("buttonVariants", () => {
  it("returns default variant and size classes", () => {
    const classes = buttonVariants();

    expect(classes).toContain("bg-primary");
    expect(classes).toContain("h-10");
  });

  it("supports destructive and small variants", () => {
    const classes = buttonVariants({
      variant: "destructive",
      size: "sm",
    });

    expect(classes).toContain("bg-danger");
    expect(classes).toContain("h-8");
  });
});
