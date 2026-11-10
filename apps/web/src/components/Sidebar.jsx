/** UI component for Sidebar in the Relay web application. */

import { useEffect, useMemo, useState } from "react";
import { Search, Users, X } from "lucide-react";
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

  const onlineIds = useMemo(
    () => new Set(onlineUsers.map((id) => String(id))),
    [onlineUsers],
  );

  const onlineCount = useMemo(
    () => users.filter((user) => onlineIds.has(String(user._id))).length,
    [users, onlineIds],
  );

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const isOnline = onlineIds.has(String(user._id));
      const name = (user.fullName || user.name || "").toLowerCase();
      return (!showOnlineOnly || isOnline) && (!query || name.includes(query));
    });
  }, [users, onlineIds, showOnlineOnly, searchQuery]);

  if (isUsersLoading) return <SidebarSkeleton />;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-base-100">
      <div className="space-y-5 border-b border-base-300/70 bg-gradient-to-br from-primary/[0.07] via-base-100 to-base-100 p-4 sm:p-5 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight leading-tight">Messages</h2>
              <p className="mt-1 text-xs font-medium text-base-content/50">{users.length} people in your workspace</p>
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

        <label className="input input-bordered flex h-12 w-full items-center gap-2 rounded-2xl border-base-300/70 bg-base-200/40 px-4 shadow-sm shadow-base-content/[0.02] transition-all duration-200 focus-within:border-primary/50 focus-within:bg-base-100 focus-within:outline-none focus-within:ring-4 focus-within:ring-primary/10">
          <Search className="size-4 shrink-0 text-base-content/45" aria-hidden="true" />
          <input
            type="search"
            className="min-w-0 grow bg-transparent text-sm outline-none placeholder:text-base-content/40"
            placeholder="Search people..."
            aria-label="Search contacts"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-base-content/50 transition hover:bg-base-300/70 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Clear contact search"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-1 py-1 text-sm text-base-content/70">
          <span className="font-medium">Show online only</span>
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-sm"
            checked={showOnlineOnly}
            onChange={(event) => setShowOnlineOnly(event.target.checked)}
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {filteredUsers.map((user) => {
          const isOnline = onlineIds.has(String(user._id));
          const isSelected = String(selectedUser?._id) === String(user._id);
          const name = user.fullName || user.name || "User";

          return (
            <button
              key={user._id}
              type="button"
              onClick={() => setSelectedUser(user)}
              aria-current={isSelected ? "true" : undefined}
              className={`group mb-1.5 flex w-full items-center gap-3 rounded-2xl border border-transparent p-3.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected
                  ? "border-primary/20 bg-primary/[0.09] text-base-content shadow-sm shadow-primary/5"
                  : "hover:border-base-300/60 hover:bg-base-200/70"
              }`}
            >
              <span className="relative block size-12 shrink-0">
                <img
                  src={user.profilePic || "/avatar.png"}
                  alt=""
                  loading="lazy"
                  className="size-12 rounded-full bg-base-300 object-cover ring-2 ring-base-100 shadow-sm"
                />
                <span
                  className={`absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-base-100 ${
                    isOnline ? "bg-success" : "bg-base-content/20"
                  }`}
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold tracking-tight">{name}</span>
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
