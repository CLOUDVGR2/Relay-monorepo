/** Tests for Badge test in the web. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Badge from "./Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>Online</Badge>);

    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("uses neutral styling by default", () => {
    render(<Badge>Status</Badge>);

    expect(screen.getByText("Status")).toHaveClass("badge", "badge-neutral");
  });

  it.each([
    ["primary", "badge-primary"],
    ["secondary", "badge-secondary"],
    ["success", "badge-success"],
    ["warning", "badge-warning"],
    ["danger", "badge-error"],
    ["info", "badge-info"],
    ["neutral", "badge-neutral"],
    ["outline", "badge-outline"],
  ])("supports the %s variant", (variant, expectedClass) => {
    render(<Badge variant={variant}>Status</Badge>);

    expect(screen.getByText("Status")).toHaveClass(expectedClass);
  });

  it.each([
    ["sm", "badge-sm"],
    ["md", null],
    ["lg", "badge-lg"],
  ])("supports the %s size", (size, expectedClass) => {
    render(<Badge size={size}>Status</Badge>);
    const badge = screen.getByText("Status");

    if (expectedClass) {
      expect(badge).toHaveClass(expectedClass);
    } else {
      expect(badge).not.toHaveClass("badge-sm", "badge-lg");
    }
  });

  it("falls back to neutral styling for an unknown variant", () => {
    render(<Badge variant="unknown">Status</Badge>);

    expect(screen.getByText("Status")).toHaveClass("badge-neutral");
  });

  it("falls back to medium sizing for an unknown size", () => {
    render(<Badge size="unknown">Status</Badge>);

    expect(screen.getByText("Status")).not.toHaveClass("badge-sm", "badge-lg");
  });

  it("renders a decorative dot when requested", () => {
    const { container } = render(<Badge dot>Online</Badge>);
    const dot = container.querySelector('[aria-hidden="true"]');

    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("rounded-full", "bg-current");
  });

  it("does not render a dot by default", () => {
    const { container } = render(<Badge>Online</Badge>);

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it("preserves a custom class and forwards standard HTML attributes", () => {
    render(
      <Badge className="custom-badge" data-testid="status-badge" title="Current status">
        Online
      </Badge>,
    );

    const badge = screen.getByTestId("status-badge");
    expect(badge).toHaveClass("custom-badge");
    expect(badge).toHaveAttribute("title", "Current status");
  });

  it("supports complex children", () => {
    render(
      <Badge>
        <strong>3</strong> unread
      </Badge>,
    );

    expect(screen.getByText("3").tagName).toBe("STRONG");
    expect(screen.getByText(/unread/)).toBeInTheDocument();
  });
});
