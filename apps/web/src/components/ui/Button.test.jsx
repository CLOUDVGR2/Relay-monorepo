/** Tests for Button test in the web. */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "./Button";

describe("Button", () => {
  it("renders its accessible name", () => {
    render(<Button>Save changes</Button>);

    expect(
      screen.getByRole("button", { name: "Save changes" })
    ).toBeInTheDocument();
  });

  it("calls the click handler when activated", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>Send message</Button>);

    await user.click(
      screen.getByRole("button", { name: "Send message" })
    );

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not activate when disabled", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <Button disabled onClick={handleClick}>
        Submit
      </Button>
    );

    const button = screen.getByRole("button", { name: "Submit" });

    expect(button).toBeDisabled();

    await user.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it("shows a busy state and disables while loading", () => {
    render(<Button loading>Saving</Button>);

    const button = screen.getByRole("button", { name: "Saving" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("supports keyboard activation", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>Continue</Button>);

    const button = screen.getByRole("button", { name: "Continue" });

    button.focus();
    expect(button).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("falls back to the primary variant and medium size for unknown options", () => {
    render(
      <Button variant="unknown" size="unknown">
        Continue
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Continue" });

    expect(button).toHaveClass("btn-primary");
    expect(button).not.toHaveClass("btn-secondary");
    expect(button).not.toHaveClass("btn-sm");
    expect(button).not.toHaveClass("btn-lg");
  });

});
