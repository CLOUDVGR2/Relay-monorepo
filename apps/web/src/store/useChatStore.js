/** Client-side state management for useChatStore in the Relay web application. */

import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

const getMessageId = (value) =>
  String(value?._id ?? value ?? "");

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

        await get().markMessagesRead(userId);
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

  markMessagesRead: async (senderId) => {
    const selectedId = getMessageId(get().selectedUser);
    if (!senderId || selectedId !== getMessageId(senderId)) return;

    try {
      const response = await axiosInstance.post(`/messages/read/${senderId}`);
      const messageIds = new Set(
        (response.data?.messageIds ?? []).map(String),
      );
      const readAt = response.data?.readAt;

      if (!messageIds.size || !readAt) return;

      if (getMessageId(get().selectedUser) !== selectedId) return;

      set((state) => ({
        messages: state.messages.map((message) =>
          messageIds.has(getMessageId(message._id))
            ? { ...message, readAt }
            : message
        ),
      }));
    } catch (error) {
      console.error(
        "[Messaging] Failed to mark conversation messages as read:",
        error.response?.data?.message || error.message,
      );
    }
  },

  editMessage: async (messageId, text) => {
    try {
      const response = await axiosInstance.patch(
        `/messages/${messageId}`,
        { text },
      );

      const updatedMessage = response.data;

      set((state) => ({
        messages: state.messages.map((message) =>
          getMessageId(message._id) === getMessageId(updatedMessage._id)
            ? updatedMessage
            : message
        ),
      }));

      return updatedMessage;
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Unable to edit this message. Please try again."
      );
      throw error;
    }
  },

  messageListener: null,
  messagesReadListener: null,
  messageUpdatedListener: null,
  messageSocket: null,

  subscribeToMessages: () => {
    const {
      selectedUser,
      messageListener,
      messagesReadListener,
      messageUpdatedListener,
      messageSocket,
    } = get();
    const socket = useAuthStore.getState().socket;

    // Remove this store's previous listeners from their original socket.
    if (messageSocket && messageListener) {
      messageSocket.off("newMessage", messageListener);
    }
    if (messageSocket && messagesReadListener) {
      messageSocket.off("messagesRead", messagesReadListener);
    }
    if (messageSocket && messageUpdatedListener) {
      messageSocket.off("messageUpdated", messageUpdatedListener);
    }

    set({
      messageListener: null,
      messagesReadListener: null,
      messageUpdatedListener: null,
      messageSocket: null,
    });

    if (!selectedUser?._id || !socket) return;

    const listener = (newMessage) => {
      const selectedId = getMessageId(get().selectedUser);
      const currentUserId = getMessageId(useAuthStore.getState().authUser);

      if (
        !selectedId ||
        getMessageId(newMessage?.senderId) !== selectedId ||
        getMessageId(newMessage?.receiverId) !== currentUserId
      ) {
        return;
      }

      set((state) => ({
        messages: state.messages.some(
          (message) => getMessageId(message._id) === getMessageId(newMessage._id)
        )
          ? state.messages
          : [...state.messages, newMessage],
      }));

      // The recipient has the conversation open, so mark this message read.
      void get().markMessagesRead(selectedId);
    };

    const readListener = ({ readerId, messageIds, readAt } = {}) => {
      const selectedId = getMessageId(get().selectedUser);
      const ids = new Set((messageIds ?? []).map(String));

      // A receipt is relevant only when the selected contact read our messages.
      if (
        !selectedId ||
        getMessageId(readerId) !== selectedId ||
        !ids.size ||
        !readAt
      ) {
        return;
      }

      set((state) => ({
        messages: state.messages.map((message) =>
          ids.has(getMessageId(message._id))
            ? { ...message, readAt }
            : message
        ),
      }));
    };

    const updatedListener = (updatedMessage) => {
      const selectedId = getMessageId(get().selectedUser);
      const currentUserId = getMessageId(useAuthStore.getState().authUser);
      const senderId = getMessageId(updatedMessage?.senderId);
      const receiverId = getMessageId(updatedMessage?.receiverId);

      const belongsToConversation =
        (senderId === currentUserId && receiverId === selectedId) ||
        (senderId === selectedId && receiverId === currentUserId);

      if (!selectedId || !belongsToConversation) return;

      set((state) => ({
        messages: state.messages.map((message) =>
          getMessageId(message._id) === getMessageId(updatedMessage._id)
            ? updatedMessage
            : message
        ),
      }));
    };

    socket.on("newMessage", listener);
    socket.on("messagesRead", readListener);
    socket.on("messageUpdated", updatedListener);

    set({
      messageListener: listener,
      messagesReadListener: readListener,
      messageUpdatedListener: updatedListener,
      messageSocket: socket,
    });
  },

  unsubscribeFromMessages: () => {
    const {
      messageListener,
      messagesReadListener,
      messageUpdatedListener,
      messageSocket,
    } = get();

    if (messageSocket && messageListener) {
      messageSocket.off("newMessage", messageListener);
    }
    if (messageSocket && messagesReadListener) {
      messageSocket.off("messagesRead", messagesReadListener);
    }
    if (messageSocket && messageUpdatedListener) {
      messageSocket.off("messageUpdated", messageUpdatedListener);
    }

    set({
      messageListener: null,
      messagesReadListener: null,
      messageUpdatedListener: null,
      messageSocket: null,
    });
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
