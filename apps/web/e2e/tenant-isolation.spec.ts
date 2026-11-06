import path from "node:path";

import { expect, test } from "@playwright/test";

const authDir = path.resolve(process.cwd(), "playwright/.auth");

const tenants = {
  acme: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Acme",
  },
  contoso: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Contoso",
  },
} as const;

test.describe("Alice — multiple memberships", () => {
  test.use({
    storageState: path.join(authDir, "alice.json"),
  });

  test("can access Acme as admin", async ({ page }) => {
    await page.goto(`/t/${tenants.acme.id}/dashboard`);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: tenants.acme.name,
      }),
    ).toBeVisible();

    await expect(page.getByText("Your role: admin")).toBeVisible();
  });

  test("can access Contoso as operator", async ({ page }) => {
    await page.goto(`/t/${tenants.contoso.id}/dashboard`);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: tenants.contoso.name,
      }),
    ).toBeVisible();

    await expect(page.getByText("Your role: operator")).toBeVisible();
  });

  test("can select both organizations", async ({ page }) => {
    await page.goto("/workspace");

    await expect(page.getByRole("link", { name: /Acme/ })).toBeVisible();

    await expect(page.getByRole("link", { name: /Contoso/ })).toBeVisible();
  });
});

test.describe("Bob — Acme viewer", () => {
  test.use({
    storageState: path.join(authDir, "bob.json"),
  });

  test("can access Acme as viewer", async ({ page }) => {
    await page.goto(`/t/${tenants.acme.id}/dashboard`);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: tenants.acme.name,
      }),
    ).toBeVisible();

    await expect(page.getByText("Your role: viewer")).toBeVisible();
  });

  test("cannot access Contoso", async ({ page }) => {
    await page.goto(`/t/${tenants.contoso.id}/dashboard`);

    await expect(
      page.getByRole("heading", {
        name: "404",
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: tenants.contoso.name,
      }),
    ).toHaveCount(0);
  });
});

test.describe("Carol — Contoso admin", () => {
  test.use({
    storageState: path.join(authDir, "carol.json"),
  });

  test("can access Contoso as admin", async ({ page }) => {
    await page.goto(`/t/${tenants.contoso.id}/dashboard`);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: tenants.contoso.name,
      }),
    ).toBeVisible();

    await expect(page.getByText("Your role: admin")).toBeVisible();
  });

  test("cannot access Acme", async ({ page }) => {
    await page.goto(`/t/${tenants.acme.id}/dashboard`);

    await expect(
      page.getByRole("heading", {
        name: "404",
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: tenants.acme.name,
      }),
    ).toHaveCount(0);
  });
});
