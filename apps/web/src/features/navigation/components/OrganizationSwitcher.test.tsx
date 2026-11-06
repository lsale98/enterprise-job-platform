import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { TenantList, TenantSummary } from "@lab/contracts";

import { OrganizationSwitcher } from "./OrganizationSwitcher";

const acme: TenantSummary = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Acme",
  role: "admin",
};

const contoso: TenantSummary = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Contoso",
  role: "operator",
};

const initialPage: TenantList = {
  items: [acme, contoso],
  nextCursor: null,
};

describe("OrganizationSwitcher", () => {
  it("renders the active organization", () => {
    render(
      <OrganizationSwitcher
        activeTenant={acme}
        initialPage={initialPage}
        platformAvailable={false}
      />,
    );

    expect(
      screen.getByText("Acme", {
        selector: "summary span",
      }),
    ).toBeInTheDocument();
  });

  it("renders authorized organizations", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSwitcher
        activeTenant={acme}
        initialPage={initialPage}
        platformAvailable={false}
      />,
    );

    await user.click(screen.getByText(/Switch organization/));

    expect(
      screen.getByRole("link", {
        name: /Contoso/,
      }),
    ).toHaveAttribute("href", `/t/${contoso.id}/dashboard`);
  });

  it("marks the active organization", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSwitcher
        activeTenant={acme}
        initialPage={initialPage}
        platformAvailable={false}
      />,
    );

    await user.click(screen.getByText(/Switch organization/));

    expect(
      screen.getByRole("link", {
        name: /Acme/,
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("does not expose platform navigation without access", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSwitcher
        activeTenant={acme}
        initialPage={initialPage}
        platformAvailable={false}
      />,
    );

    await user.click(screen.getByText(/Switch organization/));

    expect(
      screen.queryByRole("link", {
        name: "Platform administration",
      }),
    ).not.toBeInTheDocument();
  });

  it("renders platform navigation when permitted", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSwitcher
        activeTenant={acme}
        initialPage={initialPage}
        platformAvailable
      />,
    );

    await user.click(screen.getByText(/Switch organization/));

    expect(
      screen.getByRole("link", {
        name: "Platform administration",
      }),
    ).toHaveAttribute("href", "/platform/dashboard");
  });
});
