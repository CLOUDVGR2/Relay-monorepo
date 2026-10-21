/** Page component for HomePage in the Relay web application. */

import { useChatStore } from "../store/useChatStore";
import Sidebar from "../components/Sidebar";
import NoChatSelected from "../components/NoChatSelected";
import ChatContainer from "../components/ChatContainer";

const HomePage = () => {
  const { selectedUser } = useChatStore();

  return (
    <main className="h-full min-h-0 overflow-hidden bg-base-200 p-2 text-base-content sm:p-4">
      <section className="mx-auto h-full min-h-0 w-full overflow-hidden border border-base-300/80 bg-base-100 shadow-xl shadow-black/5 sm:max-w-screen-2xl sm:rounded-2xl">
        <div className="flex h-full min-h-0 overflow-hidden">
          <div className={`${selectedUser ? "hidden md:flex" : "flex"} h-full min-h-0 w-full shrink-0 flex-col md:w-64 lg:w-72`}>
            <Sidebar />
          </div>

          <div className={`${selectedUser ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`}>
            {selectedUser ? <ChatContainer /> : <NoChatSelected />}
          </div>
        </div>
      </section>
    </main>
  );
};

export default HomePage;
