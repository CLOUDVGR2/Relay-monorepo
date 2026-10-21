/** Tests for OperationsShell test in the web. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OperationsShell from "./OperationsShell";

const state = vi.hoisted(() => ({
  authUser: { fullName: "Alex Morgan" },
  logout: vi.fn(),
  theme: "light",
  setTheme: vi.fn(),
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: () => ({
    authUser: state.authUser,
    logout: state.logout,
  }),
}));

vi.mock("../store/useThemeStore", () => ({
  useThemeStore: () => ({
    theme: state.theme,
    setTheme: state.setTheme,
  }),
}));

const renderShell = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<OperationsShell />}>
          <Route path="*" element={<div>Test page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe("OperationsShell", () => {
  beforeEach(() => {
    state.authUser = { fullName: "Alex Morgan" };
    state.logout.mockReset();
    state.theme = "light";
    state.setTheme.mockReset();
  });

  it("renders Relay branding and the page outlet", () => {
    renderShell();
    expect(screen.getAllByText("Relay").length).toBeGreaterThan(0);
    expect(screen.getByText("Test page content")).toBeInTheDocument();
  });

  it("renders the signed-in user's name and initial", () => {
    renderShell();
    expect(screen.getByText("Alex Morgan")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("falls back to the account name when no user exists", () => {
    state.authUser = null;
    renderShell();
    expect(screen.getByText("Workspace administrator")).toBeInTheDocument();
    expect(screen.getByText("W")).toBeInTheDocument();
  });

  it("falls back through name and email fields", () => {
    state.authUser = { name: "Sam Lee", email: "sam@example.com" };
    const { rerender } = renderShell();
    expect(screen.getByText("Sam Lee")).toBeInTheDocument();

    state.authUser = { email: "sam@example.com" };
    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<OperationsShell />}>
            <Route path="*" element={<div>Test page content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
  });

  it("shows the correct title for infrastructure routes", () => {
    renderShell("/infrastructure");
    expect(
      document.querySelector("p.truncate.text-sm.font-semibold")
    ).toHaveTextContent("Infrastructure");
  });

  it("shows the correct title for the workspace route", () => {
    renderShell("/workspace");
    expect(
      document.querySelector("p.truncate.text-sm.font-semibold")
    ).toHaveTextContent("Messaging workspace");
  });

  it("shows the operations fallback for an unrecognized route", () => {
    renderShell("/unknown");
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("switches from light to dark theme", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(state.setTheme).toHaveBeenCalledWith("dark");
  });

  it.each(["relay", "dark", "business", "night", "coffee", "dracula", "forest"])(
    "switches dark theme %s to light",
    async (theme) => {
      state.theme = theme;
      const user = userEvent.setup();
      renderShell();

      await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
      expect(state.setTheme).toHaveBeenCalledWith("light");
    },
  );

  it("calls logout from the workspace account controls", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(state.logout).toHaveBeenCalledTimes(1);
  });

  it("provides platform, operations, and workspace navigation", () => {
    renderShell();

    expect(screen.getAllByRole("link", { name: /Overview/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Intelligence/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Infrastructure/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Settings/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Profile/ }).length).toBeGreaterThan(0);
  });

  it("renders the main content landmark and operational footer", () => {
    renderShell();

    expect(document.querySelector("#main-content")).toBeInTheDocument();
    expect(screen.getByText("Relay · AI Operations Platform")).toBeInTheDocument();
    expect(screen.getByText("Operational data requires connected endpoints")).toBeInTheDocument();
  });

  it.each([
    { path: "/settings", title: "Settings", link: /Settings/i },
    { path: "/profile", title: "My profile", link: /Profile/i },
  ])("shows the correct title and active navigation for $path", ({ path, title, link }) => {
    renderShell(path);

    expect(
      document.querySelector("p.truncate.text-sm.font-semibold"),
    ).toHaveTextContent(title);

    const matchingLinks = screen.getAllByRole("link", { name: link });

    expect(
      matchingLinks.some((element) =>
        element.className.includes("bg-primary/10"),
      ),
    ).toBe(true);
  });

  it("shows a chevron beside the active platform route", () => {
    renderShell("/infrastructure");

    expect(
      document.querySelector("svg.lucide-chevron-right"),
    ).toBeInTheDocument();
  });
});
