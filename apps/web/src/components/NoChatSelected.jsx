/** UI component for NoChatSelected in the Relay web application. */

import { ArrowUpRight, MessageCircle, Sparkles } from "lucide-react";

const NoChatSelected = () => {
  return (
    <section className="relative hidden min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-base-100 px-6 py-12 md:flex">
      <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-28 size-96 rounded-full bg-secondary/5 blur-3xl" />

      <div className="relative w-full max-w-md text-center">
        <div className="mx-auto mb-8 grid size-24 place-items-center rounded-[2rem] border border-base-300 bg-base-100 shadow-xl shadow-base-content/[0.04]">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            <MessageCircle className="size-8" strokeWidth={1.7} />
          </div>
        </div>

        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-200/60 px-3 py-1.5 text-xs font-medium text-base-content/80">
          <Sparkles className="size-3.5 text-primary" />
          A little closer, wherever you are
        </div>

        <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Make room for{" "}
          <span className="block text-primary">good conversations.</span>
        </h1>

        <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-base-content/80 sm:text-base">
          Choose someone from your contacts and pick up where life left off.
          Your next great conversation starts with a message.
        </p>

        <div className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-base-content/80">
          <span className="grid size-8 place-items-center rounded-full border border-base-300 bg-base-200">
            <ArrowUpRight className="size-4" />
          </span>
          Select a contact to begin
        </div>
      </div>

      <div className="absolute bottom-5 flex items-center gap-2 text-[11px] tracking-wide text-base-content/80">
        <span className="size-1.5 rounded-full bg-success" />
        RELAY · YOUR SPACE TO CONNECT
      </div>
    </section>
  );
};

export default NoChatSelected;
