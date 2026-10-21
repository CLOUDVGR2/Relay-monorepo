/** UI component for SidebarSkeleton in the Relay web application. */

import { Users } from "lucide-react";

const SidebarSkeleton = () => (
  <aside className="flex h-full min-h-0 w-full flex-col border-r border-base-300 bg-base-100">
    <div className="space-y-4 border-b border-base-300 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Users className="size-5 text-base-content/50" aria-hidden="true" />
        <div className="skeleton h-4 w-24" />
      </div>
      <div className="skeleton h-11 w-full rounded-xl" />
      <div className="flex items-center justify-between">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton h-5 w-10 rounded-full" />
      </div>
    </div>
    <div className="flex-1 space-y-1 overflow-hidden p-2">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl p-3">
          <div className="skeleton size-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-3.5 w-2/3" />
            <div className="skeleton h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  </aside>
);

export default SidebarSkeleton;
