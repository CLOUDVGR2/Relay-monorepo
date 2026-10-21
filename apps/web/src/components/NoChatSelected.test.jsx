/** Tests for NoChatSelected test in the web. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NoChatSelected from "./NoChatSelected";

describe("NoChatSelected", () => {
  it("renders its main heading", () => {
    render(<NoChatSelected />);

    expect(
      screen.getByRole("heading", { name: /make room for\s*good conversations/i }),
    ).toBeInTheDocument();
  });

  it("explains how to begin a conversation", () => {
    render(<NoChatSelected />);

    expect(screen.getByText(/choose someone from your contacts/i)).toBeInTheDocument();
    expect(screen.getByText(/select a contact to begin/i)).toBeInTheDocument();
  });

  it("renders the product tagline", () => {
    render(<NoChatSelected />);

    expect(screen.getByText("RELAY · YOUR SPACE TO CONNECT")).toBeInTheDocument();
  });

  it("renders a section landmark", () => {
    const { container } = render(<NoChatSelected />);

    expect(container.querySelector("section")).toBeInTheDocument();
  });

  it("does not render interactive controls in the empty state", () => {
    render(<NoChatSelected />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
