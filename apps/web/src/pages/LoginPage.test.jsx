/** Tests for LoginPage test in the web. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage";
import { useAuthStore } from "../store/useAuthStore";

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: vi.fn(),
}));

const login = vi.fn();

function renderLogin(overrides = {}) {
  useAuthStore.mockReturnValue({
    login,
    isLoggingIn: false,
    ...overrides,
  });

  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    login.mockResolvedValue(undefined);
  });

  it("renders accessible email and password fields", () => {
    renderLogin();

    expect(screen.getByLabelText(/email address/i)).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      screen.getByRole("button", { name: /enter your workspace/i }),
    ).toBeInTheDocument();
  });

  it("submits the entered credentials", async () => {
    const user = userEvent.setup();
    renderLogin();

    const email = screen.getByLabelText(/email address/i);
    const password = screen.getByLabelText(/^password$/i);

    await user.click(email);
    await user.paste("person@example.com");
    await user.click(password);
    await user.paste("StrongPass123!");
    await user.click(
      screen.getByRole("button", { name: /enter your workspace/i }),
    );

    expect(login).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "StrongPass123!",
    });
  });

  it("shows an authentication error returned by the store", async () => {
    const user = userEvent.setup();
    login.mockResolvedValue("Invalid email or password");
    renderLogin();

    await user.type(
      screen.getByLabelText(/email address/i),
      "person@example.com",
    );
    await user.type(
      screen.getByLabelText(/^password$/i),
      "wrong-password",
    );
    await user.click(
      screen.getByRole("button", { name: /enter your workspace/i }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Invalid email or password");
  });

  it("allows the user to reveal and hide the password", async () => {
    const user = userEvent.setup();
    renderLogin();

    const password = screen.getByLabelText(/^password$/i);

    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(password).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("links to account creation", () => {
    renderLogin();

    expect(
      screen.getByRole("link", { name: /create your account/i }),
    ).toHaveAttribute("href", "/signup");
  });

  it("disables submission while login is in progress", () => {
    renderLogin({ isLoggingIn: true });

    expect(
      screen.getByRole("button", { name: /signing you in/i }),
    ).toBeDisabled();
  });
});
