import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { Button } from "../../../src/index.js";

describe("Button", () => {
  it("renders a native button with default variants", () => {
    render(<Button>Create job</Button>);

    const button = screen.getByRole("button", {
      name: "Create job",
    });

    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("bg-primary");
    expect(button).toHaveClass("h-10");
    expect(button).not.toBeDisabled();
  });

  it("supports explicit variant and size", () => {
    render(
      <Button variant="outline" size="lg">
        Details
      </Button>,
    );

    const button = screen.getByRole("button", {
      name: "Details",
    });

    expect(button).toHaveClass("border-border");
    expect(button).toHaveClass("h-12");
    expect(button).not.toHaveClass("bg-primary");
  });

  it("merges custom Tailwind classes", () => {
    render(<Button className="px-8">Custom button</Button>);

    const button = screen.getByRole("button", {
      name: "Custom button",
    });

    expect(button).toHaveClass("px-8");
    expect(button).not.toHaveClass("px-4");
  });

  it("disables user interaction when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button disabled onClick={onClick}>
        Disabled action
      </Button>,
    );

    const button = screen.getByRole("button", {
      name: "Disabled action",
    });

    expect(button).toBeDisabled();

    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it("disables interaction and exposes loading state", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button loading loadingText="Processing..." onClick={onClick}>
        Create job
      </Button>,
    );

    const button = screen.getByRole("button", {
      name: "Processing...",
    });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("Processing...");

    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its accessible name during loading", () => {
    render(<Button loading>Create job</Button>);

    const button = screen.getByRole("button", {
      name: "Create job",
    });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("forwards native attributes and React ref", () => {
    const ref = createRef<HTMLButtonElement>();

    render(
      <Button
        ref={ref}
        type="submit"
        name="submit-job"
        data-testid="submit-button"
        aria-label="Submit job"
      >
        Submit
      </Button>,
    );

    const button = screen.getByRole("button", {
      name: "Submit job",
    });

    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("name", "submit-job");
    expect(ref.current).toBe(button);
  });

  it("executes click handlers when enabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Run job</Button>);

    await user.click(
      screen.getByRole("button", {
        name: "Run job",
      }),
    );

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard activation", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Keyboard action</Button>);

    await user.tab();

    const button = screen.getByRole("button", {
      name: "Keyboard action",
    });

    expect(button).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
