/** Premium conversation workspace for the Relay web application. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CheckCheck,
  MessageCircle,
  Pencil,
  ShieldCheck,
  Check,
} from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import { formatMessageTime } from "../lib/utils";

const getId = (value) => String(value?._id ?? value ?? "");

const ChatContainer = () => {
  const {
    messages,
    getMessages,
    loadOlderMessages,
    editMessage,
    isMessagesLoading,
    hasMoreMessages,
    isLoadingOlderMessages,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
  } = useChatStore();

  const { authUser, socket } = useAuthStore();
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const messageEndRef = useRef(null);
  const messageScrollRef = useRef(null);
  const pendingScrollHeightRef = useRef(null);

  useEffect(() => {
    if (!selectedUser?._id) return;

    setEditingMessageId(null);
    getMessages(selectedUser._id);
    subscribeToMessages();

    return () => unsubscribeFromMessages();
  }, [
    selectedUser?._id,
    socket,
    getMessages,
    subscribeToMessages,
    unsubscribeFromMessages,
  ]);

  useLayoutEffect(() => {
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const container = messageScrollRef.current;
    const previousHeight = pendingScrollHeightRef.current;

    if (container && previousHeight !== null) {
      container.scrollTop += container.scrollHeight - previousHeight;
      pendingScrollHeightRef.current = null;
      return;
    }

    if (!isMessagesLoading) {
      messageEndRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "end",
      });
    }
  }, [messages, isMessagesLoading]);

  if (!selectedUser) return null;

  const contactName =
    selectedUser.fullName || selectedUser.name || "Contact";
  const currentUserId = getId(authUser);

  const beginEdit = (message) => {
    setEditingMessageId(getId(message));
    setEditText(message.text || "");
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText("");
    setIsSavingEdit(false);
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    const normalizedText = editText.trim();

    if (!normalizedText || !editingMessageId || isSavingEdit) return;

    setIsSavingEdit(true);
    try {
      await editMessage(editingMessageId, normalizedText);
      cancelEdit();
    } catch {
      // The store reports the API error; keep the draft available for retry.
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-base-100">
      <ChatHeader />

      {isMessagesLoading ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-base-200/30">
          <MessageSkeleton />
        </div>
      ) : (
        <div
          ref={messageScrollRef}
          className="relative min-h-0 flex-1 overflow-y-auto bg-base-200/30"
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:radial-gradient(currentColor_0.7px,transparent_0.7px)] [background-size:20px_20px]" />

          <div
            role="log"
            aria-label={`Messages with ${contactName}`}
            aria-live="polite"
            aria-relevant="additions text"
            aria-atomic="false"
            className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col justify-end gap-6 px-4 py-8 sm:gap-7 sm:px-7 sm:py-10 lg:px-12"
          >
            {hasMoreMessages && messages.length > 0 && (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  disabled={isLoadingOlderMessages}
                  onClick={() => {
                    const container = messageScrollRef.current;
                    if (container) {
                      pendingScrollHeightRef.current = container.scrollHeight;
                    }
                    loadOlderMessages(selectedUser._id);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100 px-4 py-2 text-xs font-semibold text-base-content/70 shadow-sm transition hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-60"
                >
                  {isLoadingOlderMessages ? "Loading older messages…" : "Load older messages"}
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                <div className="mb-5 grid size-16 place-items-center rounded-3xl border border-base-300 bg-base-100 shadow-sm">
                  <MessageCircle className="size-7 text-primary" />
                </div>
                <p className="text-lg font-semibold tracking-tight">
                  Start a conversation
                </p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-base-content/65">
                  Say hello to {contactName}. Your conversation starts here.
                </p>
                <div className="mt-5 flex items-center gap-1.5 text-xs text-base-content/55">
                  <ShieldCheck className="size-3.5" />
                  Your private conversation
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const isMine = getId(message.senderId) === currentUserId;
                const avatar = isMine
                  ? authUser?.profilePic || "/avatar.png"
                  : selectedUser.profilePic || "/avatar.png";
                const isEditing = editingMessageId === getId(message);

                return (
                  <article
                    key={message._id}
                    className={`group flex w-full items-end gap-2.5 sm:gap-3 ${
                      isMine ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isMine && (
                      <img
                        src={avatar}
                        alt=""
                        loading="lazy"
                        className="mb-6 size-9 shrink-0 rounded-full bg-base-200 object-cover ring-2 ring-base-100 shadow-sm sm:size-10"
                      />
                    )}

                    <div className={`flex min-w-0 max-w-[88%] flex-col sm:max-w-[74%] lg:max-w-[65%] ${
                      isMine ? "items-end" : "items-start"
                    }`}>
                      <div className={`mb-2 flex items-center gap-2 px-1 text-xs text-base-content/55 ${
                        isMine ? "flex-row-reverse" : ""
                      }`}>
                        <span className="font-semibold text-base-content/75">
                          {isMine ? "You" : contactName}
                        </span>
                        <time dateTime={message.createdAt}>
                          {formatMessageTime(message.createdAt)}
                        </time>
                        {message.editedAt && (
                          <span className="italic">edited</span>
                        )}
                      </div>


                      {isEditing ? (
                        <form
                          onSubmit={saveEdit}
                          className="w-full min-w-[220px] rounded-2xl border border-primary/20 bg-base-100 p-4 shadow-xl shadow-base-content/[0.06]"
                        >
                          <label
                            htmlFor={`edit-${getId(message)}`}
                            className="mb-2 block text-xs font-semibold text-base-content/65"
                          >
                            Edit message
                          </label>
                          <textarea
                            id={`edit-${getId(message)}`}
                            autoFocus
                            maxLength={5000}
                            rows={3}
                            value={editText}
                            onChange={(event) => setEditText(event.target.value)}
                            className="w-full resize-y rounded-xl border border-base-300 bg-base-200/50 px-3 py-2 text-sm text-base-content outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                          />
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={isSavingEdit}
                              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-base-content/60 hover:bg-base-200"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={!editText.trim() || isSavingEdit}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content disabled:opacity-50"
                            >
                              <Check className="size-3.5" />
                              {isSavingEdit ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className={`overflow-hidden rounded-[1.35rem] text-sm leading-7 ${
                          isMine
                            ? "rounded-br-md bg-primary text-primary-content shadow-lg shadow-primary/10"
                            : "rounded-bl-md border border-base-300/60 bg-base-100 text-base-content shadow-md shadow-base-content/[0.035]"
                        }`}>
                          {message.image && (
                            <a
                              href={message.image}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Open image attachment"
                              className="block"
                            >
                              <img
                                src={message.image}
                                alt="Message attachment"
                                loading="lazy"
                                className="max-h-80 w-full object-contain sm:max-w-sm"
                              />
                            </a>
                          )}
                          {message.text && (
                            <p className="whitespace-pre-wrap break-words px-4 py-3.5 sm:px-5">
                              {message.text}
                            </p>
                          )}
                        </div>
                      )}

                      {!isEditing && (
                        <div className={`mt-1 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${
                          isMine ? "justify-end" : "justify-start"
                        }`}>
                          {isMine && message.text?.trim() && (
                            <button
                              type="button"
                              onClick={() => beginEdit(message)}
                              aria-label="Edit message"
                              title="Edit message"
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-base-content/55 transition hover:bg-base-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <Pencil className="size-3.5" />
                              Edit
                            </button>
                          )}
                        </div>
                      )}

                      {isMine && message.readAt && (
                        <span className="mt-1 inline-flex items-center gap-1 pr-1 text-[10px] font-medium text-primary/80">
                          <CheckCheck className="size-3.5" />
                          Seen
                        </span>
                      )}
                    </div>

                    {isMine && (
                      <img
                        src={avatar}
                        alt=""
                        loading="lazy"
                        className="mb-6 size-9 shrink-0 rounded-full bg-base-200 object-cover ring-2 ring-base-100 shadow-sm sm:size-10"
                      />
                    )}
                  </article>
                );
              })
            )}

            <div ref={messageEndRef} className="h-px shrink-0" />
          </div>
        </div>
      )}

      <MessageInput />
    </section>
  );
};

export default ChatContainer;
