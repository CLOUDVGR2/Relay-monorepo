/** Client-side state management for useChatStore in the Relay web application. */

import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  hasMoreMessages: false,
  isLoadingOlderMessages: false,
  olderMessagesCursor: null,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Unable to load contacts. Check your connection and try again."
      );
    } finally {
      set({ isUsersLoading: false });
    }
  },

  messageRequestId: 0,

  getMessages: async (userId) => {
    const requestId = get().messageRequestId + 1;

    set({
      messages: [],
      isMessagesLoading: true,
      hasMoreMessages: false,
      isLoadingOlderMessages: false,
      olderMessagesCursor: null,
      messageRequestId: requestId,
    });

    try {
      const res = await axiosInstance.get(`/messages/${userId}`, {
        params: { limit: 50 },
      });

      if (
        get().messageRequestId === requestId &&
        String(get().selectedUser?._id) === String(userId)
      ) {
        set((state) => {
          const combined = [...res.data, ...state.messages];
          const seen = new Set();

          const messages = combined.filter((message) => {
            if (!message?._id) return true;

            const id = String(message._id);
            if (seen.has(id)) return false;

            seen.add(id);
            return true;
          });

          messages.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime() ||
              String(a._id).localeCompare(String(b._id))
          );

          return {
            messages,
            hasMoreMessages: res.headers["x-has-more"] === "true",
            olderMessagesCursor: res.headers["x-next-cursor"] || null,
          };
        });
      }
    } catch (error) {
      if (get().messageRequestId === requestId) {
        toast.error(
          error.response?.data?.message ||
            "Unable to load messages. Check your connection and try again."
        );
      }
    } finally {
      if (get().messageRequestId === requestId) {
        set({ isMessagesLoading: false });
      }
    }
  },

  loadOlderMessages: async (userId) => {
    const initialState = get();

    if (
      initialState.isLoadingOlderMessages ||
      !initialState.hasMoreMessages ||
      !initialState.olderMessagesCursor ||
      String(initialState.selectedUser?._id) !== String(userId)
    ) {
      return;
    }

    const requestId = initialState.messageRequestId;
    const cursor = initialState.olderMessagesCursor;

    set({ isLoadingOlderMessages: true });

    try {
      const res = await axiosInstance.get(`/messages/${userId}`, {
        params: { limit: 50, before: cursor },
      });

      if (
        get().messageRequestId !== requestId ||
        String(get().selectedUser?._id) !== String(userId)
      ) {
        return;
      }

      set((state) => {
        const combined = [...res.data, ...state.messages];
        const seen = new Set();

        const messages = combined.filter((message) => {
          if (!message?._id) return true;

          const id = String(message._id);
          if (seen.has(id)) return false;

          seen.add(id);
          return true;
        });

        messages.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime() ||
            String(a._id).localeCompare(String(b._id))
        );

        return {
          messages,
          hasMoreMessages: res.headers["x-has-more"] === "true",
          olderMessagesCursor: res.headers["x-next-cursor"] || null,
        };
      });
    } catch (error) {
      if (
        get().messageRequestId === requestId &&
        String(get().selectedUser?._id) === String(userId)
      ) {
        toast.error(
          error.response?.data?.message ||
            "Unable to load older messages. Please try again."
        );
      }
    } finally {
      if (
        get().messageRequestId === requestId &&
        String(get().selectedUser?._id) === String(userId)
      ) {
        set({ isLoadingOlderMessages: false });
      }
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser } = get();

    if (!selectedUser?._id) {
      toast.error("Please select a conversation first");
      throw new Error("No conversation selected");
    }

    try {
      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
        messageData,
      );

      if (
        String(get().selectedUser?._id) === String(selectedUser._id)
      ) {
        set((state) => ({
          messages: state.messages.some(
            (message) => String(message._id) === String(res.data._id)
          )
            ? state.messages
            : [...state.messages, res.data],
        }));
      }

      return res.data;
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to send message. Please try again.",
      );
      throw error;
    }
  },

  messageListener: null,

  subscribeToMessages: () => {
    const { selectedUser, messageListener } = get();
    const socket = useAuthStore.getState().socket;

    if (!selectedUser?._id || !socket) return;

    // Remove only this store's previous listener, if one exists.
    if (messageListener) {
      socket.off("newMessage", messageListener);
    }

    // Read the current selection when an event arrives to avoid stale closures.
    const listener = (newMessage) => {
      const currentSelectedUser = get().selectedUser;

      if (
        !currentSelectedUser?._id ||
        String(newMessage.senderId) !== String(currentSelectedUser._id)
      ) {
        return;
      }

      set((state) => ({
        messages: state.messages.some(
          (message) => String(message._id) === String(newMessage._id)
        )
          ? state.messages
          : [...state.messages, newMessage],
      }));
    };

    socket.on("newMessage", listener);
    set({ messageListener: listener });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    const listener = get().messageListener;

    // Do not remove other components' newMessage listeners.
    if (socket && listener) {
      socket.off("newMessage", listener);
    }

    set({ messageListener: null });
  },

  setSelectedUser: (selectedUser) => {
    const messageRequestId = get().messageRequestId + 1;

    set({
      selectedUser,
      messages: [],
      isMessagesLoading: false,
      hasMoreMessages: false,
      isLoadingOlderMessages: false,
      olderMessagesCursor: null,
      messageRequestId,
    });
  },
}));
