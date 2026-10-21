/** Tests for ChatHeader test in the web. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatHeader from "./ChatHeader";

const state = vi.hoisted(() => ({
  selectedUser: null,
  onlineUsers: [],
  setSelectedUser: vi.fn(),
}));

vi.mock("../store/useChatStore", () => ({
  useChatStore: () => ({
    selectedUser: state.selectedUser,
    setSelectedUser: state.setSelectedUser,
  }),
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: () => ({ onlineUsers: state.onlineUsers }),
}));

describe("ChatHeader", () => {
  beforeEach(() => {
    state.selectedUser = null;
    state.onlineUsers = [];
    state.setSelectedUser.mockClear();
  });

  it("renders nothing when no conversation is selected", () => {
    const { container } = render(<ChatHeader />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the selected user's full name", () => {
    state.selectedUser = { _id: "u1", fullName: "Alex Morgan" };
    render(<ChatHeader />);
    expect(screen.getByRole("heading", { name: "Alex Morgan" })).toBeInTheDocument();
  });

  it("falls back to the user's name", () => {
    state.selectedUser = { _id: "u1", name: "Alex" };
    render(<ChatHeader />);
    expect(screen.getByRole("heading", { name: "Alex" })).toBeInTheDocument();
  });

  it("uses a fallback name when user names are missing", () => {
    state.selectedUser = { _id: "u1" };
    render(<ChatHeader />);
    expect(screen.getByRole("heading", { name: "Conversation" })).toBeInTheDocument();
  });

  it("shows active status for an online user", () => {
    state.selectedUser = { _id: "u1", fullName: "Alex" };
    state.onlineUsers = ["u1"];
    render(<ChatHeader />);
    expect(screen.getByText("Active now")).toBeInTheDocument();
  });

  it("shows away status for an offline user", () => {
    state.selectedUser = { _id: "u1", fullName: "Alex" };
    state.onlineUsers = [];
    render(<ChatHeader />);
    expect(screen.getByText("Away")).toBeInTheDocument();
  });

  it("uses the user's profile image when provided", () => {
    state.selectedUser = { _id: "u1", profilePic: "https://example.com/alex.png" };
    render(<ChatHeader />);
    expect(document.querySelector('img[src="https://example.com/alex.png"]')).toBeInTheDocument();
  });

  it("falls back to the default avatar", () => {
    state.selectedUser = { _id: "u1" };
    render(<ChatHeader />);
    expect(document.querySelector('img[src="/avatar.png"]')).toBeInTheDocument();
  });

  it("clears the selected user when Back is clicked", async () => {
    state.selectedUser = { _id: "u1", fullName: "Alex" };
    const user = userEvent.setup();
    render(<ChatHeader />);
    await user.click(screen.getByRole("button", { name: "Back to conversations" }));
    expect(state.setSelectedUser).toHaveBeenCalledWith(null);
  });

  it("clears the selected user when Close is clicked", async () => {
    state.selectedUser = { _id: "u1", fullName: "Alex" };
    const user = userEvent.setup();
    render(<ChatHeader />);
    await user.click(screen.getByRole("button", { name: "Close conversation" }));
    expect(state.setSelectedUser).toHaveBeenCalledWith(null);
  });
});
