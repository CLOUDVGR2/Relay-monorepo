/** Tests for Sidebar test in the web. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "./Sidebar";

const state = vi.hoisted(() => ({
  getUsers: vi.fn(),
  users: [],
  selectedUser: null,
  setSelectedUser: vi.fn(),
  isUsersLoading: false,
  onlineUsers: [],
}));

vi.mock("../store/useChatStore", () => ({
  useChatStore: () => ({
    getUsers: state.getUsers,
    users: state.users,
    selectedUser: state.selectedUser,
    setSelectedUser: state.setSelectedUser,
    isUsersLoading: state.isUsersLoading,
  }),
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: () => ({ onlineUsers: state.onlineUsers }),
}));

vi.mock("./skeletons/SidebarSkeleton", () => ({
  default: () => <div>Contacts loading skeleton</div>,
}));

const alex = { _id: "u1", fullName: "Alex Morgan", profilePic: "/alex.png" };
const sam = { _id: "u2", name: "Sam Lee" };
const jordan = { _id: "u3", fullName: "Jordan Kim" };

describe("Sidebar", () => {
  beforeEach(() => {
    state.getUsers.mockReset();
    state.users = [alex, sam, jordan];
    state.selectedUser = null;
    state.setSelectedUser.mockReset();
    state.isUsersLoading = false;
    state.onlineUsers = ["u1", "u3"];
  });

  it("requests users on mount", () => {
    render(<Sidebar />);
    expect(state.getUsers).toHaveBeenCalledTimes(1);
  });

  it("shows the contact count and online count", () => {
    render(<Sidebar />);
    expect(screen.getByText("3 contacts")).toBeInTheDocument();
    expect(screen.getByText("2 online")).toBeInTheDocument();
  });

  it("renders contact names and online statuses", () => {
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: /Alex Morgan/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sam Lee/ })).toBeInTheDocument();
    expect(screen.getAllByText("Online now")).toHaveLength(2);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("filters contacts by case-insensitive name", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.type(screen.getByRole("searchbox", { name: "Search contacts" }), "sAm");

    expect(screen.getByRole("button", { name: /Sam Lee/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Alex Morgan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Jordan Kim/ })).not.toBeInTheDocument();
  });

  it("trims search whitespace and supports partial matches", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.type(screen.getByRole("searchbox", { name: "Search contacts" }), "  alex  ");

    expect(screen.getByRole("button", { name: /Alex Morgan/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sam Lee/ })).not.toBeInTheDocument();
  });

  it("filters to online contacts when online-only is enabled", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.click(screen.getByRole("checkbox", { name: "Show online only" }));

    expect(screen.getByRole("button", { name: /Alex Morgan/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Jordan Kim/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sam Lee/ })).not.toBeInTheDocument();
  });

  it("combines online-only filtering with search", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.click(screen.getByRole("checkbox", { name: "Show online only" }));
    await user.type(screen.getByRole("searchbox", { name: "Search contacts" }), "jordan");

    expect(screen.getByRole("button", { name: /Jordan Kim/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Alex Morgan/ })).not.toBeInTheDocument();
  });

  it("shows the general empty state when no contacts match", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.type(screen.getByRole("searchbox", { name: "Search contacts" }), "nobody");

    expect(screen.getByText("No contacts found")).toBeInTheDocument();
    expect(screen.getByText("Try another name or check back later.")).toBeInTheDocument();
  });

  it("shows the online-specific empty state when no contacts are online", async () => {
    state.onlineUsers = [];
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.click(screen.getByRole("checkbox", { name: "Show online only" }));

    expect(screen.getByText("No contacts found")).toBeInTheDocument();
    expect(screen.getByText("No contacts are online right now.")).toBeInTheDocument();
  });

  it("selects a contact when its row is clicked", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.click(screen.getByRole("button", { name: /Alex Morgan/ }));

    expect(state.setSelectedUser).toHaveBeenCalledWith(alex);
  });

  it("marks the selected contact with aria-current", () => {
    state.selectedUser = sam;
    render(<Sidebar />);

    expect(screen.getByRole("button", { name: /Sam Lee/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /Alex Morgan/ })).not.toHaveAttribute("aria-current");
  });

  it("renders the loading skeleton instead of the contact list", () => {
    state.isUsersLoading = true;
    render(<Sidebar />);

    expect(screen.getByText("Contacts loading skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Search contacts" })).not.toBeInTheDocument();
  });

  it("supports fallback names and avatars", () => {
    state.users = [{ _id: "u4" }];
    state.onlineUsers = [];
    render(<Sidebar />);

    expect(screen.getByRole("button", { name: /User/ })).toBeInTheDocument();
    expect(document.querySelector('img[src="/avatar.png"]')).toBeInTheDocument();
  });

  it("updates the displayed online count from store state", async () => {
    const { rerender } = render(<Sidebar />);
    expect(screen.getByText("2 online")).toBeInTheDocument();

    state.onlineUsers = ["u1"];
    rerender(<Sidebar />);

    await waitFor(() => expect(screen.getByText("1 online")).toBeInTheDocument());
  });
});
