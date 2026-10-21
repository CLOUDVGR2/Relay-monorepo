/** Tests for MessageSkeleton test in the web. */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MessageSkeleton from "./MessageSkeleton";

describe("MessageSkeleton", () => {
  it("renders six message placeholders", () => {
    const { container } = render(<MessageSkeleton />);

    expect(container.querySelectorAll(".chat")).toHaveLength(6);
  });

  it("alternates message alignment", () => {
    const { container } = render(<MessageSkeleton />);
    const messages = container.querySelectorAll(".chat");

    messages.forEach((message, index) => {
      expect(message).toHaveClass(index % 2 === 0 ? "chat-start" : "chat-end");
    });
  });

  it("renders an avatar, header, and bubble placeholder for every message", () => {
    const { container } = render(<MessageSkeleton />);

    expect(container.querySelectorAll(".chat-image")).toHaveLength(6);
    expect(container.querySelectorAll(".chat-header")).toHaveLength(6);
    expect(container.querySelectorAll(".chat-bubble")).toHaveLength(6);
  });

  it("renders loading skeleton elements", () => {
    const { container } = render(<MessageSkeleton />);

    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(18);
  });

  it("does not introduce interactive controls", () => {
    const { container } = render(<MessageSkeleton />);

    expect(container.querySelectorAll("button, input, a")).toHaveLength(0);
  });
});
