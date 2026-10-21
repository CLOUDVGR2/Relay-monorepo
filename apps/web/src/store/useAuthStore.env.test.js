/** Tests for useAuthStore env test in the web. */

import { afterEach, describe, expect, it, vi } from "vitest";

const { socketMock } = vi.hoisted(() => ({
  socketMock: {
    connected: false,
    id: "environment-test-socket",
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

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
  io: vi.fn(() => socketMock),
}));

import { io } from "socket.io-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
  socketMock.connected = false;
});

describe("useAuthStore socket URL by environment", () => {
  it("uses the local API URL in development", async () => {
    vi.resetModules();
    vi.stubEnv("MODE", "development");

    const { useAuthStore } = await import("./useAuthStore.js");

    useAuthStore.setState({
      authUser: { _id: "user-1" },
      socket: null,
      onlineUsers: [],
    });

    useAuthStore.getState().connectSocket();

    expect(io).toHaveBeenCalledWith(
      "http://localhost:5001",
      expect.objectContaining({
        withCredentials: true,
        autoConnect: false,
      }),
    );
    expect(socketMock.connect).toHaveBeenCalledTimes(1);
  });

  it("uses the relative API URL outside development", async () => {
    vi.resetModules();
    vi.stubEnv("MODE", "production");

    const { useAuthStore } = await import("./useAuthStore.js");

    useAuthStore.setState({
      authUser: { _id: "user-1" },
      socket: null,
      onlineUsers: [],
    });

    useAuthStore.getState().connectSocket();

    expect(io).toHaveBeenCalledWith(
      "/",
      expect.objectContaining({
        withCredentials: true,
        autoConnect: false,
      }),
    );
    expect(socketMock.connect).toHaveBeenCalledTimes(1);
  });
});
