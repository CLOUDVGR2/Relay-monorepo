/** Tests for SignUpPage test in the web. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SignUpPage from "./SignUpPage";
import { useAuthStore } from "../store/useAuthStore";

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: vi.fn(),
}));

const signup = vi.fn();

function renderSignUp(overrides = {}) {
  useAuthStore.mockReturnValue({
    signup,
    isSigningUp: false,
    ...overrides,
  });

  return render(
    <MemoryRouter initialEntries={["/signup"]}>
      <SignUpPage />
    </MemoryRouter>,
  );
}

describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signup.mockResolvedValue(undefined);
  });

  it("renders the required account fields", () => {
    renderSignUp();

    expect(screen.getByLabelText(/full name/i)).toBeRequired();
    expect(screen.getByLabelText(/work email/i)).toBeRequired();
    expect(screen.getByLabelText(/create password/i)).toBeRequired();
  });

  it("shows password-strength requirements as the password changes", async () => {
    const user = userEvent.setup();
    renderSignUp();

    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(
      screen.getByText(/contains a letter and a number/i),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/create password/i),
      "Relay123",
    );

    expect(
      screen.getByText(/at least 8 characters/i),
    ).toHaveClass("text-emerald-300");
    expect(
      screen.getByText(/contains a letter and a number/i),
    ).toHaveClass("text-emerald-300");
  });

  it("submits trimmed name and email with the password unchanged", async () => {
    const user = userEvent.setup();
    renderSignUp();

    const fullName = screen.getByLabelText(/full name/i);
    const email = screen.getByLabelText(/work email/i);
    const password = screen.getByLabelText(/create password/i);

    await user.click(fullName);
    await user.paste("  Alex Morgan  ");
    await user.click(email);
    await user.paste("  alex@example.com  ");
    await user.click(password);
    await user.paste("RelayPass123");

    await user.click(
      screen.getByRole("button", { name: /create your account/i }),
    );

    expect(signup).toHaveBeenCalledWith({
      fullName: "Alex Morgan",
      email: "alex@example.com",
      password: "RelayPass123",
    });
  });

  it("shows an account creation error returned by the store", async () => {
    const user = userEvent.setup();
    signup.mockResolvedValue("An account with this email already exists");
    renderSignUp();

    await user.type(screen.getByLabelText(/full name/i), "Alex Morgan");
    await user.type(
      screen.getByLabelText(/work email/i),
      "alex@example.com",
    );
    await user.type(
      screen.getByLabelText(/create password/i),
      "RelayPass123",
    );

    await user.click(
      screen.getByRole("button", { name: /create your account/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An account with this email already exists",
    );
  });

  it("allows the user to reveal and hide the password", async () => {
    const user = userEvent.setup();
    renderSignUp();

    const password = screen.getByLabelText(/create password/i);

    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(password).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("links to the sign-in page from the header and form footer", () => {
    renderSignUp();

    const signInLinks = screen.getAllByRole("link", {
      name: /^sign in$/i,
    });

    expect(signInLinks).toHaveLength(2);
    signInLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/login");
    });
  });

  it("disables submission while sign-up is in progress", () => {
    renderSignUp({ isSigningUp: true });

    expect(
      screen.getByRole("button", { name: /creating your account/i }),
    ).toBeDisabled();
  });
});
