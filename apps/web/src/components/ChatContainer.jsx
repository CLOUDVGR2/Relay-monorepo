/** UI component for ChatContainer in the Relay web application. */

import { useEffect, useLayoutEffect, useRef } from "react";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import { formatMessageTime } from "../lib/utils";

const ChatContainer = () => {
  const {
    messages,
    getMessages,
    loadOlderMessages,
    isMessagesLoading,
    hasMoreMessages,
    isLoadingOlderMessages,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
  } = useChatStore();

  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);
  const messageScrollRef = useRef(null);
  const pendingScrollHeightRef = useRef(null);
  const previousMessageCountRef = useRef(0);

  useEffect(() => {
    if (!selectedUser?._id) return;

    getMessages(selectedUser._id);
    subscribeToMessages();

    return () => unsubscribeFromMessages();
  }, [
    selectedUser?._id,
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
      previousMessageCountRef.current = messages.length;
      return;
    }

    previousMessageCountRef.current = messages.length;

    if (!isMessagesLoading) {
      messageEndRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "end",
      });
    }
  }, [messages, isMessagesLoading]);

  if (!selectedUser) return null;

  return (
    <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-base-100">
      <ChatHeader />

      {isMessagesLoading ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MessageSkeleton />
        </div>
      ) : (
        <div
          ref={messageScrollRef}
          className="relative min-h-0 flex-1 overflow-y-auto"
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(currentColor_0.7px,transparent_0.7px)] [background-size:18px_18px]" />

          <div
            role="log"
            aria-label={`Messages with ${selectedUser.fullName || selectedUser.name || "contact"}`}
            aria-live="polite"
            aria-relevant="additions text"
            aria-atomic="false"
            className="relative mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end gap-5 px-3 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-10"
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
                  className="rounded-full border border-base-300 bg-base-100 px-4 py-2 text-xs font-medium text-base-content/80 shadow-sm transition hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-60"
                >
                  {isLoadingOlderMessages ? "Loading older messages…" : "Load older messages"}
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                <div className="mb-5 grid size-16 place-items-center rounded-3xl border border-base-300 bg-base-200/70 shadow-sm">
                  <MessageCircle className="size-7 text-primary" />
                </div>
                <p className="text-lg font-semibold tracking-tight">
                  Start a conversation
                </p>
                <p className="mt-2 max-w-xs text-sm leading-6 text-base-content/80">
                  Say hello to {selectedUser.fullName || selectedUser.name || "your contact"}.
                  Your conversation starts here.
                </p>
                <div className="mt-5 flex items-center gap-1.5 text-xs text-base-content/80">
                  <ShieldCheck className="size-3.5" />
                  Your private conversation
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const isMine = message.senderId === authUser?._id;
                const avatar = isMine
                  ? authUser?.profilePic || "/avatar.png"
                  : selectedUser.profilePic || "/avatar.png";

                return (
                  <div
                    key={message._id}
                    className={`flex w-full items-end gap-2.5 sm:gap-3 ${
                      isMine ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isMine && (
                      <img
                        src={avatar}
                        alt=""
                        loading="lazy"
                        className="mb-5 size-8 shrink-0 rounded-xl bg-base-200 object-cover ring-1 ring-base-300 sm:size-9"
                      />
                    )}

                    <div className={`flex max-w-[84%] flex-col sm:max-w-[72%] lg:max-w-[65%] ${
                      isMine ? "items-end" : "items-start"
                    }`}>
                      <div
                        className={`mb-1.5 flex items-center gap-2 px-1 text-[11px] text-base-content/80 ${
                          isMine ? "flex-row-reverse" : ""
                        }`}
                      >
                        <span>{isMine ? "You" : selectedUser.fullName || selectedUser.name || "Contact"}</span>
                        <time>{formatMessageTime(message.createdAt)}</time>
                      </div>

                      <div
                        className={`overflow-hidden rounded-2xl text-sm leading-6 shadow-sm ${
                          isMine
                            ? "rounded-br-md bg-gradient-to-br from-primary to-primary/85 text-primary-content shadow-md shadow-primary/10"
                            : "rounded-bl-md border border-base-300/80 bg-base-200/70 text-base-content shadow-sm"
                        }`}
                      >
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
                          <p className="whitespace-pre-wrap break-words px-4 py-3">
                            {message.text}
                          </p>
                        )}
                      </div>
                    </div>

                    {isMine && (
                      <img
                        src={avatar}
                        alt=""
                        loading="lazy"
                        className="mb-5 size-8 shrink-0 rounded-xl bg-base-200 object-cover ring-1 ring-base-300 sm:size-9"
                      />
                    )}
                  </div>
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
