/** Runtime configuration for the Relay web application. */

import { THEMES } from "../constants";
import { useThemeStore } from "../store/useThemeStore";
import { Check, Palette, Send, Sparkles, Monitor } from "lucide-react";

const PREVIEW_MESSAGES = [
  { id: 1, content: "Hey! How's it going?", isSent: false },
  { id: 2, content: "I'm doing great! Just working on some new features.", isSent: true },
];

const SettingsPage = () => {
  const { theme, setTheme } = useThemeStore();

  return (
    <main className="min-h-full px-4 pb-10 pt-6 text-base-content sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-col gap-5 border-b border-base-300/70 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-base-content">
              <Sparkles size={13} />
              Make it yours
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Appearance
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-base-content">
              Personalize your workspace with a theme that feels right. Your selection updates the interface immediately.
            </p>
          </div>

          <div className="flex w-fit items-center gap-3 rounded-2xl border border-base-300/80 bg-base-100 px-4 py-3 shadow-sm">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Monitor size={19} />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-base-content">
                Current theme
              </p>
              <p className="mt-0.5 text-sm font-semibold capitalize">{theme}</p>
            </div>
            <span className="ml-2 grid size-6 place-items-center rounded-full bg-success/10 text-success">
              <Check size={14} />
            </span>
          </div>
        </header>

        <section className="rounded-3xl border border-base-300/70 bg-base-100 p-5 shadow-sm sm:p-7 lg:p-8">
          <div className="mb-7 flex items-start gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Palette size={19} />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Theme gallery</h2>
              <p className="mt-1 text-xs leading-5 text-base-content/55">
                Select a palette to preview it across your Relay workspace.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
            {THEMES.map((t) => {
              const isSelected = theme === t;

              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`Use ${t} theme`}
                  onClick={() => setTheme(t)}
                  className={`group rounded-2xl border p-3 text-left transition duration-200 hover:-translate-y-0.5 ${
                    isSelected
                      ? "border-primary bg-primary/[0.07] shadow-md shadow-primary/10 ring-1 ring-primary/30"
                      : "border-base-300/80 bg-base-100 hover:border-primary/40 hover:bg-base-200/50"
                  }`}
                >
                  <div
                    className="relative h-16 overflow-hidden rounded-xl border border-base-content/10"
                    data-theme={t}
                  >
                    <div className="absolute inset-0 bg-base-100" />
                    <div className="absolute inset-x-0 top-0 flex h-5 items-center gap-1 border-b border-base-content/10 bg-base-200 px-2">
                      <span className="size-1.5 rounded-full bg-primary" />
                      <span className="h-1 w-8 rounded-full bg-base-content/20" />
                    </div>
                    <div className="absolute inset-x-2 bottom-2 top-7 flex gap-1.5">
                      <div className="w-1/3 rounded-md bg-base-200 p-1">
                        <div className="h-1 w-full rounded-full bg-base-content/20" />
                        <div className="mt-1 h-1 w-2/3 rounded-full bg-base-content/10" />
                      </div>
                      <div className="flex flex-1 flex-col justify-end gap-1">
                        <div className="h-3 w-4/5 rounded-md bg-primary" />
                        <div className="ml-auto h-3 w-3/5 rounded-md bg-secondary" />
                      </div>
                    </div>
                    {isSelected && (
                      <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-content shadow">
                        <Check size={12} />
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-semibold">
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </span>
                    {isSelected && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-primary">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex gap-1.5" data-theme={t}>
                    <span className="h-1.5 flex-1 rounded-full bg-primary" />
                    <span className="h-1.5 flex-1 rounded-full bg-secondary" />
                    <span className="h-1.5 flex-1 rounded-full bg-accent" />
                    <span className="h-1.5 flex-1 rounded-full bg-neutral" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-base-300/70 bg-base-100 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-base-300/70 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Live preview</h2>
              <p className="mt-1 text-xs text-base-content/55">
                See how your selected theme looks in a conversation.
              </p>
            </div>
            <span className="flex w-fit items-center gap-2 rounded-full border border-success/20 bg-success/10 px-3 py-1.5 text-[10px] font-semibold text-success">
              <span className="size-1.5 rounded-full bg-success" />
              Interactive preview
            </span>
          </div>

          <div className="bg-base-200/40 p-4 sm:p-8 lg:p-10">
            <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-base-300/80 bg-base-100 shadow-xl shadow-black/[0.06]">
              <div className="flex items-center justify-between border-b border-base-300/80 bg-base-100 px-4 py-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative grid size-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-content">
                    J
                    <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-base-100 bg-success" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">Jordan Lee</h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-base-content/55">
                      <span className="size-1.5 rounded-full bg-success" />
                      Online
                    </p>
                  </div>
                </div>
                <span className="rounded-lg border border-base-300 bg-base-200/70 px-2.5 py-1.5 text-[10px] font-medium text-base-content/60">
                  Preview
                </span>
              </div>

              <div className="min-h-[210px] space-y-5 bg-base-100 p-4 sm:p-6">
                <div className="flex justify-center">
                  <span className="rounded-full border border-base-300/70 bg-base-200/70 px-3 py-1 text-[10px] text-base-content/50">
                    Today
                  </span>
                </div>

                {PREVIEW_MESSAGES.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isSent ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%] ${
                        message.isSent
                          ? "rounded-br-md bg-gradient-to-br from-primary to-primary/85 text-primary-content"
                          : "rounded-bl-md border border-base-300/80 bg-base-200/75 text-base-content"
                      }`}
                    >
                      <p className="text-sm leading-6">{message.content}</p>
                      <p
                        className={`mt-1.5 text-right text-[10px] ${
                          message.isSent
                            ? "text-primary-content/70"
                            : "text-base-content/50"
                        }`}
                      >
                        12:00 PM
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-base-300/80 bg-base-100 p-3 sm:p-4">
                <div className="flex items-center gap-2 rounded-2xl border border-base-300/80 bg-base-200/50 p-2 transition focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
                  <input
                    type="text"
                    className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-base-content/40"
                    placeholder="Type a message..."
                    value="This is a preview"
                    readOnly
                    aria-label="Chat preview message"
                  />
                  <button
                    type="button"
                    disabled
                    title="Sending is disabled in the preview"
                    className="grid size-10 shrink-0 cursor-not-allowed place-items-center rounded-xl bg-primary text-primary-content opacity-50"
                    aria-label="Sending disabled in preview"
                  >
                    <Send size={17} />
                  </button>
                </div>
                <p className="mt-2 text-center text-[10px] text-base-content/40">
                  Preview messages are illustrative and are not sent.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default SettingsPage;
