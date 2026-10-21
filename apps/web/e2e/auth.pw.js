/** Auth pw module for the Relay web application. */

import { test, expect } from "@playwright/test";

test.describe("Relay authentication", () => {
  test("login page renders accessible fields and signup navigation", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByLabel(/email address/i),
    ).toBeVisible();

    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();

    await page.getByRole("link", { name: /create your account/i }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("login requires email and password", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("button", {
      name: /enter your workspace/i,
    }).click();

    await expect(page.getByLabel(/email address/i)).toHaveJSProperty(
      "validity.valid",
      false,
    );
  });

  test("login displays an API authentication error", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Invalid email or password",
        }),
      });
    });

    await page.goto("/login");
    await page.getByLabel(/email address/i).fill("alex@example.com");
    await page.getByLabel(/^password$/i).fill("WrongPassword123");
    await page.getByRole("button", {
      name: /enter your workspace/i,
    }).click();

    await expect(page.getByRole("alert")).toContainText(
      "Invalid email or password",
    );
  });

  test("login password visibility can be toggled", async ({ page }) => {
    await page.goto("/login");

    const password = page.getByLabel(/^password$/i);

    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: /show password/i }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: /hide password/i }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("signup page renders required fields and login navigation", async ({
    page,
  }) => {
    await page.goto("/signup");

    await expect(
      page.getByRole("heading", { name: /your next chapter/i }),
    ).toBeVisible();

    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel(/work email/i)).toBeVisible();
    await expect(page.getByLabel(/create password/i)).toBeVisible();

    await page.getByRole("link", { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signup validates password requirements as the user types", async ({
    page,
  }) => {
    await page.goto("/signup");

    await page.getByLabel(/create password/i).fill("Relay123");

    await expect(
      page.getByText("At least 8 characters"),
    ).toHaveClass(/text-emerald-300/);

    await expect(
      page.getByText("Contains a letter and a number"),
    ).toHaveClass(/text-emerald-300/);
  });

  test("signup displays an API error for an existing account", async ({
    page,
  }) => {
    await page.route("**/api/auth/signup", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message: "An account with this email already exists",
        }),
      });
    });

    await page.goto("/signup");
    await page.getByLabel(/full name/i).fill("Alex Morgan");
    await page.getByLabel(/work email/i).fill("alex@example.com");
    await page.getByLabel(/create password/i).fill("RelayPass123");

    await page.getByRole("button", {
      name: /create your account/i,
    }).click();

    await expect(page.getByRole("alert")).toContainText(
      "An account with this email already exists",
    );
  });

  test("signup enforces required fields", async ({ page }) => {
    await page.goto("/signup");

    await page.getByRole("button", {
      name: /create your account/i,
    }).click();

    await expect(page.getByLabel(/full name/i)).toHaveJSProperty(
      "validity.valid",
      false,
    );
  });
});
