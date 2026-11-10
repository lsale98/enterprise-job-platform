import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TenantSummary } from "@lab/contracts";

import { TenantDashboard } from "./TenantDashboard";

const tenant: TenantSummary = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Acme",
  role: "admin",
};

describe("TenantDashboard", () => {
  it("renders the tenant name from the API contract", () => {
    render(<TenantDashboard tenant={tenant} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Acme",
      }),
    ).toBeInTheDocument();
  });

  it("renders the tenant role", () => {
    render(<TenantDashboard tenant={tenant} />);

    expect(screen.getByText("Your role: admin")).toBeInTheDocument();
  });

  it("renders another tenant without transforming its DTO", () => {
    render(
      <TenantDashboard
        tenant={{
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Contoso",
          role: "operator",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Contoso",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("Your role: operator")).toBeInTheDocument();
  });
});
