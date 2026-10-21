/** Page component for AIAssistantPage in the Relay web application. */

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  CircleAlert,
  Clock3,
  Command,
  FileText,
  LoaderCircle,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { axiosInstance } from "../lib/axios";

const suggestions = [
  {
    icon: BookOpen,
    title: "Explore my knowledge",
    prompt: "What are the main topics covered by my available documents?",
  },
  {
    icon: ShieldCheck,
    title: "Investigate an issue",
    prompt: "What troubleshooting steps are documented for common issues?",
  },
  {
    icon: FileText,
    title: "Summarize a document",
    prompt: "Summarize the key findings in the available documentation.",
  },
];

function Citation({ citation, index }) {
  const source = citation.source_uri || "";
  const isExternal =
    source.startsWith("https://") || source.startsWith("http://");

  return (
    <article className="flex min-w-0 items-start gap-3 rounded-xl border border-base-300 bg-base-100 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <FileText size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/80">
          Source {index + 1}
        </p>
        <p className="mt-1 break-words text-sm font-semibold">
          {citation.title || "Untitled document"}
        </p>
        <p className="mt-1 text-xs text-base-content/80">
          Chunk {Number.isInteger(citation.chunk_index) ? citation.chunk_index + 1 : "—"}
          {Number.isInteger(citation.start) && Number.isInteger(citation.end)
            ? ` · Characters ${citation.start}–${citation.end}`
            : ""}
        </p>
        {source && (
          isExternal ? (
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-xs font-medium text-primary hover:underline"
            >
              Open source <ArrowRight size={12} />
            </a>
          ) : (
            <p className="mt-2 break-all text-xs text-base-content/80">
              {source}
            </p>
          )
        )}
      </div>
    </article>
  );
}

export default function AIAssistantPage() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSources, setShowSources] = useState({});
  const inputRef = useRef(null);
  const bottomRef = useRef(null);
  const requestRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  async function askQuestion(value = question) {
    const trimmed = value.trim();

    if (!trimmed || trimmed.length > 2000 || requestRef.current) return;

    requestRef.current = true;
    setIsLoading(true);
    setError("");
    setQuestion("");

    const messageId = `${Date.now()}-${messages.length}`;

    setMessages((current) => [
      ...current,
      { id: messageId, question: trimmed, answer: null, citations: [] },
    ]);

    try {
      const response = await axiosInstance.post("/ai/answer", {
        question: trimmed,
        top_k: 5,
      });

      const answer =
        typeof response.data?.answer === "string"
          ? response.data.answer
          : "The AI service returned an unexpected response.";

      const citations = Array.isArray(response.data?.citations)
        ? response.data.citations
        : [];

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, answer, citations }
            : message,
        ),
      );
    } catch (err) {
      const status = err.response?.status;
      const message =
        status === 401
          ? "Your session may have expired. Please sign in again."
          : status === 403
            ? "This request was blocked by the API's origin policy. Check CLIENT_URL in the Express configuration."
            : status === 429
              ? "You've reached the current request limit. Please wait a moment and try again."
              : status === 504
                ? "The answer took too long. Try a shorter or more specific question."
                : status === 502 || status === 503
                  ? "The AI service is temporarily unavailable. Check that Python AI and Ollama are running."
                  : "We couldn't complete your request. Please try again.";

      setError(message);
      setMessages((current) =>
        current.filter((item) => item.id !== messageId),
      );
      setQuestion(trimmed);
    } finally {
      requestRef.current = false;
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function startNewConversation() {
    if (isLoading) return;
    setMessages([]);
    setError("");
    setQuestion("");
    setShowSources({});
    inputRef.current?.focus();
  }

  return (
    <div className="min-h-full bg-base-200/50">
      <div className="mx-auto flex min-h-full max-w-[1440px] flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/15">
              <Sparkles size={23} />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                RELAY INTELLIGENCE
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                AI Assistant
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={startNewConversation}
            disabled={isLoading || messages.length === 0}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-4 text-sm font-medium transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={16} />
            New conversation
          </button>
        </header>

        <section className="mt-7 grid gap-3 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, label: "Evidence-grounded answers" },
            { icon: BookOpen, label: "Document citations" },
            { icon: Clock3, label: "Private to your account" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 rounded-xl border border-base-300/80 bg-base-100/80 px-4 py-3"
            >
              <Icon size={16} className="shrink-0 text-primary" />
              <span className="text-xs font-medium text-base-content/80">
                {label}
              </span>
            </div>
          ))}
        </section>

        <section
          aria-label="AI conversation"
          className="mt-6 flex min-h-[440px] flex-1 flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Command size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold">Relay Knowledge</p>
                <p className="text-[11px] text-base-content/80">
                  Retrieval-augmented AI
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-base-300 px-2.5 py-1 text-[10px] font-medium text-base-content/80">
              <span className="size-1.5 rounded-full bg-success" />
              Session only
            </span>
          </div>

          <div className="flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
            {messages.length === 0 && !isLoading ? (
              <div className="mx-auto flex max-w-2xl flex-col items-center py-8 text-center sm:py-12">
                <div className="grid size-16 place-items-center rounded-3xl border border-primary/20 bg-primary/10 text-primary">
                  <Sparkles size={28} />
                </div>
                <h2 className="mt-6 text-xl font-semibold tracking-tight sm:text-2xl">
                  What would you like to understand?
                </h2>
                <p className="mt-3 max-w-lg text-sm leading-6 text-base-content/80">
                  Ask a question about your indexed documents. Relay retrieves
                  relevant evidence and provides source references when available.
                </p>

                <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-3">
                  {suggestions.map(({ icon: Icon, title, prompt }) => (
                    <button
                      key={title}
                      type="button"
                      onClick={() => askQuestion(prompt)}
                      className="group rounded-xl border border-base-300 bg-base-100 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md disabled:opacity-50"
                      disabled={isLoading}
                    >
                      <Icon size={19} className="text-primary" />
                      <p className="mt-4 text-sm font-semibold">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-base-content/80">
                        {prompt}
                      </p>
                      <ArrowRight
                        size={15}
                        className="mt-3 text-base-content/80 transition group-hover:translate-x-1 group-hover:text-primary"
                      />
                    </button>
                  ))}
                </div>

                <p className="mt-7 flex items-center gap-2 text-[11px] text-base-content/80">
                  <ShieldCheck size={14} />
                  Answers are limited to evidence available to your account.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <article key={message.id} className="space-y-5">
                  <div className="ml-auto max-w-[92%] sm:max-w-[85%]">
                    <div className="mb-2 text-right text-[11px] font-medium text-base-content/80">
                      YOU
                    </div>
                    <div className="ml-auto w-fit max-w-full rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-content">
                      <p className="whitespace-pre-wrap break-words">
                        {message.question}
                      </p>
                    </div>
                  </div>

                  {message.answer ? (
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                        <Sparkles size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="mb-2 text-[11px] font-semibold text-base-content/80">
                          RELAY AI
                        </p>
                        <div className="whitespace-pre-wrap break-words text-sm leading-7">
                          {message.answer}
                        </div>

                        {message.citations.length > 0 ? (
                          <div className="mt-5 border-t border-base-300 pt-4">
                            <button
                              type="button"
                              onClick={() =>
                                setShowSources((current) => ({
                                  ...current,
                                  [message.id]: !current[message.id],
                                }))
                              }
                              aria-expanded={Boolean(showSources[message.id])}
                              className="flex min-h-10 w-full items-center justify-between gap-3 text-left text-sm font-semibold"
                            >
                              <span className="flex items-center gap-2">
                                <BookOpen size={16} className="text-primary" />
                                Sources ({message.citations.length})
                              </span>
                              <ArrowDown
                                size={15}
                                className={`transition-transform ${
                                  showSources[message.id] ? "rotate-180" : ""
                                }`}
                              />
                            </button>

                            {showSources[message.id] && (
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {message.citations.map((citation, index) => (
                                  <Citation
                                    key={citation.chunk_id || `${message.id}-${index}`}
                                    citation={citation}
                                    index={index}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="mt-4 flex items-start gap-2 rounded-xl border border-base-300 bg-base-200/60 p-3 text-xs leading-5 text-base-content/80">
                            <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                            No source citations were returned. Verify important
                            information against your original documentation.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))
            )}

            {isLoading && (
              <div role="status" aria-live="polite" className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles size={17} />
                </span>
                <div>
                  <p className="mb-2 text-[11px] font-semibold text-base-content/80">
                    RELAY AI
                  </p>
                  <div className="flex items-center gap-2 rounded-xl bg-base-200 px-4 py-3 text-sm text-base-content/80">
                    <LoaderCircle size={16} className="animate-spin" />
                    Searching evidence and preparing an answer…
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {error && (
            <div
              role="alert"
              className="mx-4 mb-3 flex items-start gap-3 rounded-xl border border-error/25 bg-error/5 p-3 text-sm sm:mx-6"
            >
              <CircleAlert size={17} className="mt-0.5 shrink-0 text-error" />
              <p className="flex-1 leading-6">{error}</p>
              <button
                type="button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
                className="rounded-lg p-1 hover:bg-base-300"
              >
                <X size={15} />
              </button>
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              askQuestion();
            }}
            className="border-t border-base-300 bg-base-100 p-3 sm:p-5"
          >
            <label htmlFor="ai-question" className="sr-only">
              Ask Relay AI a question
            </label>
            <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-2xl border border-base-300 bg-base-200/60 p-2 transition focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
              <textarea
                ref={inputRef}
                id="ai-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    askQuestion();
                  }
                }}
                rows={2}
                maxLength={2000}
                disabled={isLoading}
                placeholder="Ask a question about your documents…"
                className="max-h-40 min-h-12 min-w-0 flex-1 resize-y bg-transparent px-3 py-3 text-sm leading-6 outline-none placeholder:text-base-content/70 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isLoading || !question.trim() || question.trim().length > 2000}
                aria-label="Send question"
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-content shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLoading ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <Send size={17} />
                )}
              </button>
            </div>
            <div className="mx-auto mt-2 flex max-w-4xl flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-base-content/80">
              <span>Enter to send · Shift + Enter for a new line</span>
              <span>{question.length}/2000</span>
            </div>
          </form>
        </section>

        <p className="mt-4 text-center text-[11px] leading-5 text-base-content/80">
          AI-generated responses can be incomplete. Use source references to verify critical details.
        </p>
      </div>
    </div>
  );
}
