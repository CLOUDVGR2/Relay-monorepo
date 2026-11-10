/** UI component for MessageInput in the Relay web application. */

import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Send, X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

const MAX_IMAGE_SIZE = 7 * 1024 * 1024;

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const { sendMessage } = useChatStore();
  const isSocketConnected = useAuthStore((state) => state.isSocketConnected);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose a valid image file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("Images must be smaller than 7 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImagePreview(reader.result);
      } else {
        toast.error("Could not preview this image.");
      }
    };

    reader.onerror = () => {
      toast.error("Could not read the selected image.");
      event.target.value = "";
    };

    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();

    const trimmedText = text.trim();
    const attachedImage = imagePreview || "";

    // Allow text-only, image-only, and combined messages.
    if (!trimmedText && !attachedImage) return;
    if (isSending) return;

    setIsSending(true);
    setSendStatus("Sending message.");

    try {
      await sendMessage({
        text: trimmedText,
        ...(attachedImage ? { image: attachedImage } : {}),
      });

      setSendStatus("Message sent successfully.");
      setText("");
      setImagePreview(null);

      if (fileInputRef.current) fileInputRef.current.value = "";

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.focus();
      }
    } catch (error) {
      // Preserve the draft and attachment so the user can retry.
      // The existing toast reports the sending error.
      setSendStatus("");
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleTextChange = (event) => {
    setText(event.target.value);

    const textarea = event.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  };

  const canSend = Boolean(text.trim() || imagePreview) && !isSending;

  return (
    <footer className="relative z-10 shrink-0 border-t border-base-300/60 bg-base-100/95 px-4 pb-4 pt-4 sm:px-6 sm:pb-5 lg:px-10">
      <form onSubmit={handleSendMessage} className="mx-auto w-full max-w-5xl">
        {imagePreview && (
          <div className="mb-3 flex items-start gap-3 rounded-2xl border border-base-300/70 bg-base-200/40 p-3.5 shadow-sm">
            <div className="relative shrink-0">
              <img
                src={imagePreview}
                alt="Selected attachment preview"
                className="size-16 rounded-xl border border-base-300 object-cover"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-base-300 bg-base-100 text-base-content shadow-md transition hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Remove attached image"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm font-medium">Image attached</p>
              <p className="mt-1 text-xs text-base-content/80">
                Your image will be sent with this message.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-[1.5rem] border border-base-300/70 bg-base-200/40 p-2.5 shadow-sm transition duration-200 focus-within:border-primary/50 focus-within:bg-base-100 focus-within:shadow-xl focus-within:shadow-primary/[0.07]">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
            aria-label="Choose an image attachment"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
            className={`btn btn-ghost btn-square size-11 shrink-0 rounded-2xl ${
              imagePreview ? "text-primary" : "text-base-content/80"
            }`}
            aria-label="Attach an image"
            title="Attach image"
          >
            <ImagePlus className="size-5" />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={handleTextChange}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            disabled={isSending}
            placeholder="Write a message..."
            aria-label="Message text"
            aria-describedby="message-keyboard-help"
            aria-keyshortcuts="Enter Shift+Enter"
            className="max-h-36 min-h-11 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-3 text-sm leading-6 text-base-content outline-none placeholder:text-base-content/55 focus:outline-none disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={!canSend}
            className={`btn btn-square size-11 shrink-0 rounded-2xl transition-all duration-200 ${
              canSend
                ? "bg-primary text-primary-content shadow-lg shadow-primary/20 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                : "border border-base-300 bg-base-100 text-base-content/60"
            }`}
            aria-label={isSending ? "Sending message" : "Send message"}
            title="Send message"
          >
            {isSending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-3 pt-3">
          <p id="message-keyboard-help" className="text-[11px] font-medium text-base-content/55">
            Enter to send <span className="px-1">·</span> Shift + Enter for a new line
          </p>
          <p
            className="hidden items-center gap-1.5 text-[11px] text-base-content/80 sm:flex"
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className={`inline-block size-1.5 rounded-full ${
                isSocketConnected ? "bg-success" : "bg-warning"
              }`}
            />
            {isSocketConnected
              ? "Live updates connected"
              : "Live updates unavailable"}
          </p>
        </div>
        <p className="a11y-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {sendStatus}
        </p>
      </form>
    </footer>
  );
};

export default MessageInput;
