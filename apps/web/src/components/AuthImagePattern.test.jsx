/** Tests for AuthImagePattern test in the web. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AuthImagePattern from "./AuthImagePattern";

describe("AuthImagePattern", () => {
  it("renders the supplied title and subtitle", () => {
    render(
      <AuthImagePattern title="Welcome back" subtitle="Connect with your people" />,
    );

    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Connect with your people")).toBeInTheDocument();
  });

  it("renders exactly nine decorative grid cells", () => {
    const { container } = render(
      <AuthImagePattern title="Title" subtitle="Subtitle" />,
    );

    const grid = container.querySelector(".grid.grid-cols-3");
    expect(grid).toBeInTheDocument();
    expect(grid.children).toHaveLength(9);
  });

  it("animates alternating cells only", () => {
    const { container } = render(
      <AuthImagePattern title="Title" subtitle="Subtitle" />,
    );

    const cells = container.querySelector(".grid.grid-cols-3").children;

    Array.from(cells).forEach((cell, index) => {
      if (index % 2 === 0) {
        expect(cell).toHaveClass("animate-pulse");
      } else {
        expect(cell).not.toHaveClass("animate-pulse");
      }
    });
  });

  it("renders safely with empty text props", () => {
    render(<AuthImagePattern title="" subtitle="" />);

    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("preserves long supplied text", () => {
    const title = "A".repeat(300);
    const subtitle = "B".repeat(500);

    render(<AuthImagePattern title={title} subtitle={subtitle} />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(subtitle)).toBeInTheDocument();
  });
});
