/** Page component for HomePage in the Relay web application. */

import { useChatStore } from "../store/useChatStore";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const HomePage = () => {
  const { selectedUser } = useChatStore();

  return (
    <main className="h-full min-h-0 overflow-hidden bg-base-200/70 p-2 text-base-content sm:p-4 lg:p-5">
      <section className="mx-auto h-full min-h-0 w-full max-w-[1800px] overflow-hidden rounded-2xl border border-base-300/70 bg-base-100 shadow-2xl shadow-base-content/[0.06] sm:rounded-3xl">
        <div className="flex h-full min-h-0 overflow-hidden">
          <div
            className={`${selectedUser ? "hidden md:flex" : "flex"} h-full min-h-0 w-full shrink-0 flex-col border-r border-base-300/70 md:w-[290px] lg:w-[320px] xl:w-[350px]`}
          >
            <Sidebar />
          </div>

          <div
            className={`${selectedUser ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col bg-base-100`}
          >
            {selectedUser ? <ChatContainer /> : <NoChatSelected />}
          </div>
        </div>
      </section>
    </main>
  );
};

export default HomePage;
