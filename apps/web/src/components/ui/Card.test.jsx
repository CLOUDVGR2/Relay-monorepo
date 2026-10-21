/** Tests for Card test in the web. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Card from "./Card";

describe("Card", () => {
  it("renders its children", () => {
    render(<Card>Card content</Card>);

    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("renders a title and associates it with the container", () => {
    render(<Card title="Account details">Content</Card>);

    const heading = screen.getByRole("heading", { name: "Account details" });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("id");

    const card = heading.parentElement.parentElement;
    expect(card).toHaveAttribute("aria-labelledby", heading.id);
  });

  it("renders a description and associates it with the container", () => {
    render(
      <Card title="Settings" description="Manage your preferences">
        Content
      </Card>,
    );

    const description = screen.getByText("Manage your preferences");
    const card = description.parentElement.parentElement;

    expect(card).toHaveAttribute("aria-describedby", description.id);
  });

  it("supports a custom footer", () => {
    render(<Card footer={<button>Save</button>}>Content</Card>);

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it.each([
    ["none", false],
    ["sm", true],
    ["md", true],
    ["lg", true],
  ])("supports %s padding", (padding, hasPadding) => {
    render(<Card padding={padding}>Content</Card>);

    const content = screen.getByText("Content");

    if (!hasPadding) {
      expect(content).not.toHaveClass("p-3", "p-5", "p-6");
    } else if (padding === "sm") {
      expect(content).toHaveClass("p-3");
    } else if (padding === "md") {
      expect(content).toHaveClass("p-5", "sm:p-6");
    } else {
      expect(content).toHaveClass("p-6", "sm:p-8");
    }
  });

  it("falls back to medium padding for an unknown padding value", () => {
    render(<Card padding="unknown">Content</Card>);

    expect(screen.getByText("Content")).toHaveClass("p-5", "sm:p-6");
  });

  it("supports a custom container element", () => {
    render(<Card as="article">Article content</Card>);

    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("supports a custom heading level", () => {
    render(<Card title="Details" titleAs="h3">Content</Card>);

    expect(screen.getByRole("heading", { name: "Details", level: 3 })).toBeInTheDocument();
  });

  it("supports unstyled mode", () => {
    render(<Card unstyled data-testid="plain-card">Content</Card>);

    const card = screen.getByTestId("plain-card");
    expect(card).not.toHaveClass("card", "border", "bg-base-100");
    expect(card).toHaveTextContent("Content");
  });

  it("forwards custom classes and HTML attributes", () => {
    render(
      <Card className="custom-card" data-testid="profile-card" title="Profile">
        Content
      </Card>,
    );

    expect(screen.getByTestId("profile-card")).toHaveClass("custom-card");
  });

  it("does not add heading or description references when they are absent", () => {
    render(<Card data-testid="plain">Content</Card>);

    expect(screen.getByTestId("plain")).not.toHaveAttribute("aria-labelledby");
    expect(screen.getByTestId("plain")).not.toHaveAttribute("aria-describedby");
  });

  it("renders without crashing when content is empty", () => {
    const { container } = render(<Card />);

    expect(container.firstChild).toBeInTheDocument();
  });
});
