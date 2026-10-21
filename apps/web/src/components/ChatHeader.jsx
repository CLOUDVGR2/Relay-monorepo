/** UI component for ChatHeader in the Relay web application. */

import { ArrowLeft, MoreHorizontal, ShieldCheck } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();

  if (!selectedUser) return null;

  const isOnline = onlineUsers.includes(selectedUser._id);
  const name = selectedUser.fullName || selectedUser.name || "Conversation";

  return (
    <header className="relative z-10 flex min-h-[76px] shrink-0 items-center justify-between gap-3 border-b border-base-300/80 bg-base-100/95 px-3 shadow-sm shadow-black/[0.02] backdrop-blur-xl sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setSelectedUser(null)}
          className="btn btn-ghost btn-square btn-sm shrink-0 rounded-xl md:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-5" />
        </button>

        <div className="relative shrink-0">
          <img
            src={selectedUser.profilePic || "/avatar.png"}
            alt=""
            className="size-11 rounded-2xl bg-base-200 object-cover ring-1 ring-base-300"
          />
          <span
            className={`absolute -bottom-1 -right-1 size-3.5 rounded-full border-[3px] border-base-100 ${
              isOnline ? "bg-success" : "bg-base-content/25"
            }`}
          />
        </div>

        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight sm:text-base">
            {name}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-base-content/80">
            <span className={`size-1.5 rounded-full ${isOnline ? "bg-success" : "bg-base-content/30"}`} />
            {isOnline ? "Active now" : "Away"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="hidden items-center gap-1.5 rounded-full border border-base-300 px-3 py-2 text-xs text-base-content/80 sm:flex">
          <ShieldCheck className="size-3.5 text-primary" />
          Direct conversation
        </div>

        <button
          type="button"
          onClick={() => setSelectedUser(null)}
          className="btn btn-ghost btn-square btn-sm rounded-xl"
          aria-label="Close conversation"
          title="Close conversation"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </div>
    </header>
  );
};

export default ChatHeader;
