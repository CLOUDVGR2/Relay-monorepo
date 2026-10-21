/** Tests for Navbar test in the web. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";

const state = vi.hoisted(() => ({
  authUser: null,
  logout: vi.fn(),
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: () => ({
    authUser: state.authUser,
    logout: state.logout,
  }),
}));

const renderNavbar = (initialEntry = "/") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Navbar />
    </MemoryRouter>,
  );

describe("Navbar", () => {
  beforeEach(() => {
    state.authUser = null;
    state.logout.mockReset();
  });

  it("renders Relay branding and the home link", () => {
    renderNavbar();
    expect(screen.getByRole("link", { name: "Relay home" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Relay")).toBeInTheDocument();
  });

  it("shows sign-in navigation when logged out", () => {
    renderNavbar();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Chat" })).not.toBeInTheDocument();
  });

  it("shows authenticated navigation when a user is signed in", () => {
    state.authUser = { _id: "u1", fullName: "Alex Morgan" };
    renderNavbar();

    expect(screen.getByRole("link", { name: "Chat" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Intelligence" })).toHaveAttribute("href", "/intelligence");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("calls logout when the logout button is clicked", async () => {
    state.authUser = { _id: "u1", fullName: "Alex" };
    const user = userEvent.setup();
    renderNavbar();

    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(state.logout).toHaveBeenCalledTimes(1);
  });

  it("keeps settings available for authenticated users", () => {
    state.authUser = { _id: "u1" };
    renderNavbar();

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });
});
