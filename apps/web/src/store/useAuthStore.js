/** Client-side state management for useAuthStore in the Relay web application. */

import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

const BASE_URL = "/";

let authStateRequestId = 0;
let signupRequestId = 0;
let loginRequestId = 0;

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,
  onlineUsers: [],
  isSocketConnected: false,
  socket: null,

  checkAuth: async () => {
    const requestId = ++authStateRequestId;

    try {
      const res = await axiosInstance.get("/auth/check");
      if (requestId !== authStateRequestId) return;

      set({ authUser: res.data });
      get().connectSocket();
    } catch (error) {
      if (requestId !== authStateRequestId) return;

      if (error.response?.status !== 401) {
        console.error("Error in checkAuth:", error);
      }
      set({ authUser: null });
      get().disconnectSocket();
    } finally {
      if (requestId === authStateRequestId) {
        set({ isCheckingAuth: false });
      }
    }
  },

  signup: async (data) => {
    const requestId = ++authStateRequestId;
    const operationId = ++signupRequestId;
    set({ isSigningUp: true });

    try {
      const res = await axiosInstance.post("/auth/signup", data);

      if (requestId !== authStateRequestId) return;

      set({ authUser: res.data });
      toast.success("Account created successfully");
      get().connectSocket();
    } catch (error) {
      if (requestId !== authStateRequestId) return;

      return error.response?.data?.message ||
        "Request failed. Check your connection and try again.";
    } finally {
      if (operationId === signupRequestId) {
        set({ isSigningUp: false });
      }
    }
  },

  login: async (data) => {
    const requestId = ++authStateRequestId;
    const operationId = ++loginRequestId;
    set({ isLoggingIn: true });

    try {
      const res = await axiosInstance.post("/auth/login", data);

      if (requestId !== authStateRequestId) return;

      set({ authUser: res.data });
      toast.success("Logged in successfully");
      get().connectSocket();
    } catch (error) {
      if (requestId !== authStateRequestId) return;

      return error.response?.data?.message ||
        "Request failed. Check your connection and try again.";
    } finally {
      if (operationId === loginRequestId) {
        set({ isLoggingIn: false });
      }
    }
  },

  logout: async () => {
    const requestId = ++authStateRequestId;

    try {
      await axiosInstance.post("/auth/logout");

      if (requestId !== authStateRequestId) return;

      set({ authUser: null });
      toast.success("Logged out successfully");
      get().disconnectSocket();
    } catch (error) {
      if (requestId !== authStateRequestId) return;

      toast.error(
        error.response?.data?.message ||
          "Request failed. Check your connection and try again."
      );
    }
  },

  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
      return true;
    } catch (error) {
      console.error("Profile update failed:", error);
      toast.error(error.response?.data?.message || "Request failed. Check your connection and try again.");
      return false;
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  connectSocket: () => {
    const { authUser, socket: existingSocket } = get();

    if (!authUser) return;

    // Keep the existing socket and its message listeners during reconnection.
    if (existingSocket) {
      if (!existingSocket.connected) {
        set({ onlineUsers: [], isSocketConnected: false });
        existingSocket.connect();
      }
      return;
    }

    const socket = io(BASE_URL, {
      withCredentials: true,
      autoConnect: false,
    });

    socket.on("connect", () => {
      set({ isSocketConnected: true });
      console.log("[Presence] Socket connected:", socket.id);
    });

    socket.on("getOnlineUsers", (userIds) => {
      console.log("[Presence] Online user IDs received:", userIds);
      set({ onlineUsers: Array.isArray(userIds) ? userIds.map(String) : [] });
    });

    socket.on("connect_error", (error) => {
      set({ isSocketConnected: false });
      console.error("[Presence] Socket connection failed:", error.message);
    });

    socket.on("disconnect", () => {
      set({ isSocketConnected: false, onlineUsers: [] });
    });

    set({ socket, onlineUsers: [], isSocketConnected: false });
    socket.connect();
  },

  disconnectSocket: () => {
    const { socket } = get();

    if (socket) {
      socket.removeAllListeners("getOnlineUsers");
      socket.disconnect();
    }

    set({ socket: null, onlineUsers: [], isSocketConnected: false });
  },
}));
