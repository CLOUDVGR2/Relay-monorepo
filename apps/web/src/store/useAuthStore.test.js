/** Tests for useAuthStore test in the web. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";

vi.mock("../lib/axios.js", () => ({
  axiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("socket.io-client", () => ({
  io: vi.fn(),
}));

const socketMock = {
  connected: false,
  id: "test-socket",
  on: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
};

const initialState = {
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,
};

const testUser = {
  _id: "user-123",
  fullName: "Alex Morgan",
  email: "alex@example.com",
};

const networkError = {
  response: {
    data: { message: "Invalid credentials" },
    status: 401,
  },
};

describe("useAuthStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    socketMock.connected = false;
    useAuthStore.setState(initialState);
    io.mockReturnValue(socketMock);
  });

  describe("login", () => {
    it("stores the authenticated user and connects the socket", async () => {
      axiosInstance.post.mockResolvedValue({ data: testUser });

      await useAuthStore.getState().login({
        email: testUser.email,
        password: "StrongPass123!",
      });

      expect(axiosInstance.post).toHaveBeenCalledWith("/auth/login", {
        email: testUser.email,
        password: "StrongPass123!",
      });
      expect(useAuthStore.getState().authUser).toEqual(testUser);
      expect(useAuthStore.getState().isLoggingIn).toBe(false);
      expect(toast.success).toHaveBeenCalledWith("Logged in successfully");
      expect(io).toHaveBeenCalledTimes(1);
      expect(socketMock.connect).toHaveBeenCalledTimes(1);
    });

    it("returns the API error and resets the loading state", async () => {
      axiosInstance.post.mockRejectedValue(networkError);

      const result = await useAuthStore.getState().login({
        email: "alex@example.com",
        password: "wrong",
      });

      expect(result).toBe("Invalid credentials");
      expect(useAuthStore.getState().isLoggingIn).toBe(false);
      expect(useAuthStore.getState().authUser).toBeNull();
      expect(io).not.toHaveBeenCalled();
    });

    it("returns a fallback message when the request has no API message", async () => {
      axiosInstance.post.mockRejectedValue(new Error("Network unavailable"));

      const result = await useAuthStore.getState().login({
        email: "alex@example.com",
        password: "password",
      });

      expect(result).toBe(
        "Request failed. Check your connection and try again.",
      );
      expect(useAuthStore.getState().isLoggingIn).toBe(false);
    });
  });

  describe("signup", () => {
    it("stores the new user and connects the socket", async () => {
      axiosInstance.post.mockResolvedValue({ data: testUser });

      await useAuthStore.getState().signup({
        fullName: testUser.fullName,
        email: testUser.email,
        password: "StrongPass123!",
      });

      expect(axiosInstance.post).toHaveBeenCalledWith("/auth/signup", {
        fullName: testUser.fullName,
        email: testUser.email,
        password: "StrongPass123!",
      });
      expect(useAuthStore.getState().authUser).toEqual(testUser);
      expect(useAuthStore.getState().isSigningUp).toBe(false);
      expect(toast.success).toHaveBeenCalledWith(
        "Account created successfully",
      );
      expect(socketMock.connect).toHaveBeenCalledTimes(1);
    });

    it("returns the API error and resets the loading state", async () => {
      axiosInstance.post.mockRejectedValue(networkError);

      const result = await useAuthStore.getState().signup({
        fullName: "Alex Morgan",
        email: "alex@example.com",
        password: "wrong",
      });

      expect(result).toBe("Invalid credentials");
      expect(useAuthStore.getState().isSigningUp).toBe(false);
      expect(useAuthStore.getState().authUser).toBeNull();
    });
  });

  describe("checkAuth", () => {
    it("loads the current session and connects the socket", async () => {
      axiosInstance.get.mockResolvedValue({ data: testUser });

      await useAuthStore.getState().checkAuth();

      expect(axiosInstance.get).toHaveBeenCalledWith("/auth/check");
      expect(useAuthStore.getState().authUser).toEqual(testUser);
      expect(useAuthStore.getState().isCheckingAuth).toBe(false);
      expect(socketMock.connect).toHaveBeenCalledTimes(1);
    });

    it("handles a missing session without logging an error", async () => {
      const consoleError = vi.spyOn(console, "error");
      axiosInstance.get.mockRejectedValue({
        response: { status: 401 },
      });

      await useAuthStore.getState().checkAuth();

      expect(useAuthStore.getState().authUser).toBeNull();
      expect(useAuthStore.getState().isCheckingAuth).toBe(false);
      expect(consoleError).not.toHaveBeenCalled();
      expect(io).not.toHaveBeenCalled();
    });

    it("resets the session state and logs unexpected errors", async () => {
      const consoleError = vi.spyOn(console, "error");
      const error = new Error("Server unavailable");
      axiosInstance.get.mockRejectedValue(error);

      await useAuthStore.getState().checkAuth();

      expect(useAuthStore.getState().authUser).toBeNull();
      expect(useAuthStore.getState().isCheckingAuth).toBe(false);
      expect(consoleError).toHaveBeenCalledWith("Error in checkAuth:", error);
    });
  });

  describe("logout", () => {
    it("clears the session and disconnects the socket", async () => {
      useAuthStore.setState({
        authUser: testUser,
        socket: socketMock,
        onlineUsers: ["user-456"],
      });
      axiosInstance.post.mockResolvedValue({ data: {} });

      await useAuthStore.getState().logout();

      expect(axiosInstance.post).toHaveBeenCalledWith("/auth/logout");
      expect(useAuthStore.getState().authUser).toBeNull();
      expect(useAuthStore.getState().socket).toBeNull();
      expect(useAuthStore.getState().onlineUsers).toEqual([]);
      expect(socketMock.removeAllListeners).toHaveBeenCalledWith(
        "getOnlineUsers",
      );
      expect(socketMock.disconnect).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith("Logged out successfully");
    });

    it("shows an error and preserves the session when logout fails", async () => {
      useAuthStore.setState({ authUser: testUser });
      axiosInstance.post.mockRejectedValue(networkError);

      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().authUser).toEqual(testUser);
      expect(toast.error).toHaveBeenCalledWith("Invalid credentials");
    });
  });

  describe("updateProfile", () => {
    it("updates the user and returns true", async () => {
      const updatedUser = { ...testUser, fullName: "Alex Updated" };
      axiosInstance.put.mockResolvedValue({ data: updatedUser });

      const result = await useAuthStore.getState().updateProfile({
        fullName: "Alex Updated",
      });

      expect(axiosInstance.put).toHaveBeenCalledWith(
        "/auth/update-profile",
        { fullName: "Alex Updated" },
      );
      expect(result).toBe(true);
      expect(useAuthStore.getState().authUser).toEqual(updatedUser);
      expect(useAuthStore.getState().isUpdatingProfile).toBe(false);
      expect(toast.success).toHaveBeenCalledWith(
        "Profile updated successfully",
      );
    });

    it("returns false and resets loading when the API fails", async () => {
      const consoleError = vi.spyOn(console, "error");
      axiosInstance.put.mockRejectedValue(networkError);

      const result = await useAuthStore.getState().updateProfile({
        fullName: "Alex Updated",
      });

      expect(result).toBe(false);
      expect(useAuthStore.getState().isUpdatingProfile).toBe(false);
      expect(toast.error).toHaveBeenCalledWith("Invalid credentials");
      expect(consoleError).toHaveBeenCalledWith(
        "Profile update failed:",
        networkError,
      );
    });
  });

  describe("socket lifecycle", () => {
    it("does not connect when there is no authenticated user", () => {
      useAuthStore.getState().connectSocket();

      expect(io).not.toHaveBeenCalled();
    });

    it("reuses an already connected socket", () => {
      socketMock.connected = true;
      useAuthStore.setState({
        authUser: testUser,
        socket: socketMock,
      });

      useAuthStore.getState().connectSocket();

      expect(io).not.toHaveBeenCalled();
      expect(socketMock.connect).not.toHaveBeenCalled();
    });

    it("converts online user IDs to strings", () => {
      useAuthStore.setState({ authUser: testUser });

      useAuthStore.getState().connectSocket();

      const onlineUsersHandler = socketMock.on.mock.calls.find(
        ([event]) => event === "getOnlineUsers",
      )?.[1];

      expect(onlineUsersHandler).toBeTypeOf("function");

      onlineUsersHandler([123, "user-456"]);

      expect(useAuthStore.getState().onlineUsers).toEqual([
        "123",
        "user-456",
      ]);
    });

    it("clears online users when the socket disconnects", () => {
      useAuthStore.setState({ authUser: testUser });

      useAuthStore.getState().connectSocket();

      const disconnectHandler = socketMock.on.mock.calls.find(
        ([event]) => event === "disconnect",
      )?.[1];

      useAuthStore.setState({ onlineUsers: ["user-456"] });
      disconnectHandler();

      expect(useAuthStore.getState().onlineUsers).toEqual([]);
    });

    it("disconnects and clears socket state", () => {
      useAuthStore.setState({
        socket: socketMock,
        onlineUsers: ["user-456"],
      });

      useAuthStore.getState().disconnectSocket();

      expect(socketMock.removeAllListeners).toHaveBeenCalledWith(
        "getOnlineUsers",
      );
      expect(socketMock.disconnect).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().socket).toBeNull();
      expect(useAuthStore.getState().onlineUsers).toEqual([]);
    });

    it("reuses a stale socket and clears presence while reconnecting", () => {
      const staleSocket = {
        ...socketMock,
        connected: false,
        removeAllListeners: vi.fn(),
        disconnect: vi.fn(),
        on: vi.fn(),
        connect: vi.fn(),
      };

      useAuthStore.setState({
        authUser: testUser,
        socket: staleSocket,
        onlineUsers: ["old-user"],
        isSocketConnected: false,
      });

      useAuthStore.getState().connectSocket();

      expect(staleSocket.connect).toHaveBeenCalledTimes(1);
      expect(staleSocket.removeAllListeners).not.toHaveBeenCalled();
      expect(staleSocket.disconnect).not.toHaveBeenCalled();
      expect(io).not.toHaveBeenCalled();
      expect(useAuthStore.getState().socket).toBe(staleSocket);
      expect(useAuthStore.getState().onlineUsers).toEqual([]);
      expect(useAuthStore.getState().isSocketConnected).toBe(false);
    });

    it("clears online users when the server sends an invalid payload", () => {
      useAuthStore.setState({
        authUser: testUser,
        onlineUsers: ["user-456"],
      });

      useAuthStore.getState().connectSocket();

      const handler = socketMock.on.mock.calls.find(
        ([event]) => event === "getOnlineUsers",
      )?.[1];

      expect(handler).toBeTypeOf("function");

      handler(null);
      expect(useAuthStore.getState().onlineUsers).toEqual([]);

      handler({ unexpected: true });
      expect(useAuthStore.getState().onlineUsers).toEqual([]);
    });

    it("handles socket connect and connection errors", () => {
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      useAuthStore.setState({ authUser: testUser });
      useAuthStore.getState().connectSocket();

      const connectHandler = socketMock.on.mock.calls.find(
        ([event]) => event === "connect",
      )?.[1];

      const errorHandler = socketMock.on.mock.calls.find(
        ([event]) => event === "connect_error",
      )?.[1];

      expect(connectHandler).toBeTypeOf("function");
      expect(errorHandler).toBeTypeOf("function");

      connectHandler();
      expect(consoleLog).toHaveBeenCalledWith(
        "[Presence] Socket connected:",
        socketMock.id,
      );

      errorHandler({ message: "Connection refused" });
      expect(consoleError).toHaveBeenCalledWith(
        "[Presence] Socket connection failed:",
        "Connection refused",
      );
    });

    it("disconnects safely when no socket exists", () => {
      useAuthStore.setState({
        socket: null,
        onlineUsers: ["user-456"],
      });

      useAuthStore.getState().disconnectSocket();

      expect(useAuthStore.getState().socket).toBeNull();
      expect(useAuthStore.getState().onlineUsers).toEqual([]);
      expect(socketMock.disconnect).not.toHaveBeenCalled();
    });
  });

  it("uses the fallback message when signup fails without an API message", async () => {
    axiosInstance.post.mockRejectedValue(new Error("Network unavailable"));

    const result = await useAuthStore.getState().signup({
      fullName: "Alex Morgan",
      email: "alex@example.com",
      password: "password",
    });

    expect(result).toBe("Request failed. Check your connection and try again.");
    expect(useAuthStore.getState().isSigningUp).toBe(false);
  });

  it("uses the fallback message when logout fails without an API message", async () => {
    axiosInstance.post.mockRejectedValue(new Error("Network unavailable"));

    await useAuthStore.getState().logout();

    expect(toast.error).toHaveBeenCalledWith(
      "Request failed. Check your connection and try again.",
    );
  });

  it("uses the fallback message when profile update fails without an API message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    axiosInstance.put.mockRejectedValue(new Error("Network unavailable"));

    const result = await useAuthStore.getState().updateProfile({
      fullName: "Alex Updated",
    });

    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      "Request failed. Check your connection and try again.",
    );
    expect(useAuthStore.getState().isUpdatingProfile).toBe(false);
  });

});
