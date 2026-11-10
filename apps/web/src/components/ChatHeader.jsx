/** UI component for ChatHeader in the Relay web application. */

import { ArrowLeft, ShieldCheck, X } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();

  if (!selectedUser) return null;

  const isOnline = onlineUsers.some((id) => String(id) === String(selectedUser._id));
  const name = selectedUser.fullName || selectedUser.name || "Conversation";

  return (
    <header className="relative z-10 flex min-h-[88px] shrink-0 items-center justify-between gap-3 border-b border-base-300/70 bg-base-100/95 px-4 shadow-sm shadow-base-content/[0.03] backdrop-blur-xl sm:px-6 lg:px-8">
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
            className="size-12 rounded-full bg-base-200 object-cover ring-2 ring-base-100 shadow-md shadow-base-content/10"
          />
          <span
            className={`absolute -bottom-1 -right-1 size-3.5 rounded-full border-[3px] border-base-100 ${
              isOnline ? "bg-success" : "bg-base-content/25"
            }`}
          />
        </div>

        <div className="min-w-0">
          <h2 className="truncate text-base font-bold tracking-tight sm:text-lg">
            {name}
          </h2>
          <p className="mt-1.5 flex items-center gap-2 text-xs font-medium text-base-content/60">
            <span className={`size-1.5 rounded-full ${isOnline ? "bg-success" : "bg-base-content/30"}`} />
            {isOnline ? "Active now" : "Offline"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="hidden items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-4 py-2.5 text-xs font-semibold text-base-content/65 sm:flex">
          <ShieldCheck className="size-3.5 text-primary" />
          Private conversation
        </div>

        <button
          type="button"
          onClick={() => setSelectedUser(null)}
          className="btn btn-ghost btn-square btn-sm rounded-xl text-base-content/60 transition hover:bg-base-200 hover:text-base-content"
          aria-label="Close conversation"
          title="Close conversation"
        >
          <X className="size-5" />
        </button>
      </div>
    </header>
  );
};

export default ChatHeader;
