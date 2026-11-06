import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const authDir = path.resolve(process.cwd(), "playwright/.auth");

const users = [
  {
    name: "alice",
    username: "alice@example.test",
    passwordEnv: "E2E_ALICE_PASSWORD",
    tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization: "Acme",
    expectedDestination: "workspace",
  },
  {
    name: "bob",
    username: "bob@example.test",
    passwordEnv: "E2E_BOB_PASSWORD",
    tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization: "Acme",
    expectedDestination: "dashboard",
  },
  {
    name: "carol",
    username: "carol@example.test",
    passwordEnv: "E2E_CAROL_PASSWORD",
    tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    organization: "Contoso",
    expectedDestination: "dashboard",
  },
] as const;

for (const user of users) {
  test(`authenticate ${user.name}`, async ({ page }) => {
    const password = process.env[user.passwordEnv];

    if (!password) {
      throw new Error(
        `${user.passwordEnv} is required for authenticated E2E tests`,
      );
    }

    await mkdir(authDir, { recursive: true });

    await page.goto("/auth/signin");

    await page
      .getByRole("button", {
        name: /sign in|log in|continue|keycloak/i,
      })
      .click();

    await expect(page.locator("#username")).toBeVisible();

    await page.locator("#username").fill(user.username);
    await page.locator("#password").fill(password);

    await page.locator("#kc-login").click();

    if (user.expectedDestination === "workspace") {
      await expect(page).toHaveURL(/\/workspace\/?$/);

      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Select workspace",
        }),
      ).toBeVisible();

      await expect(
        page.getByRole("link", {
          name: new RegExp(user.organization),
        }),
      ).toBeVisible();
    } else {
      await expect(page).toHaveURL(
        new RegExp(`/t/${user.tenantId}/dashboard(?:\\?.*)?$`),
        { timeout: 20_000 },
      );

      await expect(
        page.getByRole("heading", {
          level: 1,
          name: user.organization,
        }),
      ).toBeVisible();
    }

    await page.context().storageState({
      path: path.join(authDir, `${user.name}.json`),
    });
  });
}
