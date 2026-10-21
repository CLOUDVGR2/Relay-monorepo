/** UI component for Sidebar in the Relay web application. */

import { useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import SidebarSkeleton from "./skeletons/SidebarSkeleton";
import { Badge } from "../components/ui";

const Sidebar = () => {
  const { getUsers, users, selectedUser, setSelectedUser, isUsersLoading } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  const onlineCount = useMemo(
    () => users.filter((user) => onlineUsers.includes(user._id)).length,
    [users, onlineUsers],
  );

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const isOnline = onlineUsers.includes(user._id);
      const name = (user.fullName || user.name || "").toLowerCase();
      return (!showOnlineOnly || isOnline) && (!query || name.includes(query));
    });
  }, [users, onlineUsers, showOnlineOnly, searchQuery]);

  if (isUsersLoading) return <SidebarSkeleton />;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-base-300/80 bg-base-100">
      <div className="space-y-4 border-b border-base-300/80 bg-gradient-to-b from-primary/[0.04] to-transparent p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold leading-tight">Messages</h2>
              <p className="mt-1 text-xs text-base-content/60">{users.length} contacts</p>
            </div>
          </div>
          <Badge
            variant="success"
            size="sm"
            dot
            className="badge-outline whitespace-nowrap"
            aria-label={`${onlineCount} contacts online`}
          >
            {onlineCount} online
          </Badge>
        </div>

        <label className="input input-bordered flex h-11 w-full items-center gap-2 rounded-xl bg-base-200/60">
          <Search className="size-4 shrink-0 text-base-content/50" aria-hidden="true" />
          <input
            type="search"
            className="grow bg-transparent text-sm outline-none"
            placeholder="Search people..."
            aria-label="Search contacts"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-base-content/70">
          <span>Show online only</span>
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-sm"
            checked={showOnlineOnly}
            onChange={(event) => setShowOnlineOnly(event.target.checked)}
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filteredUsers.map((user) => {
          const isOnline = onlineUsers.includes(user._id);
          const isSelected = selectedUser?._id === user._id;
          const name = user.fullName || user.name || "User";

          return (
            <button
              key={user._id}
              type="button"
              onClick={() => setSelectedUser(user)}
              aria-current={isSelected ? "true" : undefined}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected
                  ? "bg-primary/10 text-base-content ring-1 ring-primary/25 shadow-sm shadow-primary/5"
                  : "hover:bg-base-200"
              }`}
            >
              <span className="relative block size-12 shrink-0">
                <img
                  src={user.profilePic || "/avatar.png"}
                  alt=""
                  loading="lazy"
                  className="size-12 rounded-full bg-base-300 object-cover ring-1 ring-base-300"
                />
                <span
                  className={`absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-base-100 ${
                    isOnline ? "bg-success" : "bg-base-content/20"
                  }`}
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{name}</span>
                <span className="mt-1 block text-xs text-base-content/60">
                  {isOnline ? "Online now" : "Offline"}
                </span>
              </span>
              {isSelected && <span className="size-2 shrink-0 rounded-full bg-primary" />}
            </button>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-base-200 text-base-content/50">
              <Users className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">No contacts found</p>
            <p className="mt-1 text-xs text-base-content/60">
              {showOnlineOnly
                ? "No contacts are online right now."
                : "Try another name or check back later."}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
