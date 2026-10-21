/** Tests for ChatContainer test in the web. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatContainer from "./ChatContainer";

const state = vi.hoisted(() => ({
  chat: {
    messages: [],
    getMessages: vi.fn(),
    isMessagesLoading: false,
    selectedUser: null,
    subscribeToMessages: vi.fn(),
    unsubscribeFromMessages: vi.fn(),
  },
  auth: { authUser: { _id: "me", profilePic: "/me.png" } },
}));

vi.mock("../store/useChatStore", () => ({
  useChatStore: () => state.chat,
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: () => state.auth,
}));

vi.mock("./ChatHeader", () => ({ default: () => <div>Mock chat header</div> }));
vi.mock("./MessageInput", () => ({ default: () => <div>Mock message input</div> }));
vi.mock("./skeletons/MessageSkeleton", () => ({ default: () => <div>Loading messages skeleton</div> }));
vi.mock("../lib/utils", () => ({ formatMessageTime: () => "12:00 PM" }));

describe("ChatContainer", () => {
  beforeEach(() => {
    state.chat.messages = [];
    state.chat.getMessages.mockReset();
    state.chat.isMessagesLoading = false;
    state.chat.selectedUser = null;
    state.chat.subscribeToMessages.mockReset();
    state.chat.unsubscribeFromMessages.mockReset();
    state.auth.authUser = { _id: "me", profilePic: "/me.png" };

    Element.prototype.scrollIntoView = vi.fn();
  });

  it("uses auto scrolling when reduced motion is preferred", () => {
    state.chat.selectedUser = { _id: "contact-1", fullName: "Alex" };
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );

    try {
      render(<ChatContainer />);

      expect(window.matchMedia).toHaveBeenCalledWith(
        "(prefers-reduced-motion: reduce)",
      );
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "end",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders nothing without a selected user", () => {
    const { container } = render(<ChatContainer />);
    expect(container.firstChild).toBeNull();
    expect(state.chat.getMessages).not.toHaveBeenCalled();
  });

  it("loads messages and subscribes when a conversation is selected", () => {
    state.chat.selectedUser = { _id: "contact-1", fullName: "Alex" };
    render(<ChatContainer />);

    expect(state.chat.getMessages).toHaveBeenCalledWith("contact-1");
    expect(state.chat.subscribeToMessages).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes when the selected conversation unmounts", () => {
    state.chat.selectedUser = { _id: "contact-1", fullName: "Alex" };
    const { unmount } = render(<ChatContainer />);
    unmount();
    expect(state.chat.unsubscribeFromMessages).toHaveBeenCalledTimes(1);
  });

  it("shows the message loading skeleton", () => {
    state.chat.selectedUser = { _id: "contact-1", fullName: "Alex" };
    state.chat.isMessagesLoading = true;
    render(<ChatContainer />);

    expect(screen.getByText("Loading messages skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });

  it("shows the empty-conversation prompt", () => {
    state.chat.selectedUser = { _id: "contact-1", fullName: "Alex" };
    render(<ChatContainer />);

    expect(screen.getByText("Start a conversation")).toBeInTheDocument();
    expect(screen.getByText(/Say hello to Alex/)).toBeInTheDocument();
    expect(screen.getByText("Your private conversation")).toBeInTheDocument();
  });

  it("labels the message log with the selected user's name", () => {
    state.chat.selectedUser = { _id: "contact-1", fullName: "Alex" };
    render(<ChatContainer />);
    expect(screen.getByRole("log", { name: "Messages with Alex" })).toBeInTheDocument();
  });

  it("renders received text messages and sender name", () => {
    state.chat.selectedUser = { _id: "contact-1", fullName: "Alex" };
    state.chat.messages = [{
      _id: "m1",
      senderId: "contact-1",
      text: "Hello there",
      createdAt: "2026-01-01T12:00:00.000Z",
    }];
    render(<ChatContainer />);

    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("12:00 PM")).toBeInTheDocument();
  });

  it("renders the current user's message as You", () => {
    state.chat.selectedUser = { _id: "contact-1", fullName: "Alex" };
    state.chat.messages = [{
      _id: "m2",
      senderId: "me",
      text: "My message",
      createdAt: "2026-01-01T12:00:00.000Z",
    }];
    render(<ChatContainer />);

    expect(screen.getByText("My message")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("renders an image attachment with a safe link", () => {
    state.chat.selectedUser = { _id: "contact-1", fullName: "Alex" };
    state.chat.messages = [{
      _id: "m3",
      senderId: "contact-1",
      image: "https://example.com/image.png",
      createdAt: "2026-01-01T12:00:00.000Z",
    }];
    render(<ChatContainer />);

    const link = screen.getByRole("link", { name: "Open image attachment" });
    expect(link).toHaveAttribute("href", "https://example.com/image.png");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByRole("img", { name: "Message attachment" })).toHaveAttribute(
      "src",
      "https://example.com/image.png",
    );
  });

  it("uses a generic contact name in the empty conversation prompt", () => {
    state.chat.selectedUser = { _id: "contact-1" };
    state.chat.messages = [];

    render(<ChatContainer />);

    expect(
      screen.getByRole("log", { name: "Messages with contact" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Say hello to your contact/),
    ).toBeInTheDocument();
  });

  it("handles the current user's message when their profile picture is missing", () => {
    state.auth.authUser = { _id: "me" };
    state.chat.selectedUser = { _id: "contact-1", fullName: "Alex" };
    state.chat.messages = [{
      _id: "m5",
      senderId: "me",
      text: "Profile fallback test",
      createdAt: "2026-01-01T12:00:00.000Z",
    }];

    render(<ChatContainer />);

    expect(screen.getByText("Profile fallback test")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("uses fallback names and avatars when user details are missing", () => {
    state.chat.selectedUser = { _id: "contact-1" };
    state.chat.messages = [{
      _id: "m4",
      senderId: "contact-1",
      text: "Fallback",
      createdAt: "2026-01-01T12:00:00.000Z",
    }];
    render(<ChatContainer />);

    expect(screen.getByRole("log", { name: "Messages with contact" })).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(document.querySelector('img[src="/avatar.png"]')).toBeInTheDocument();
  });
});
