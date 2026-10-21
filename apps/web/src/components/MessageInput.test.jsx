/** Tests for MessageInput test in the web. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MessageInput from "./MessageInput";

const state = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../store/useChatStore", () => ({
  useChatStore: () => ({ sendMessage: state.sendMessage }),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: state.toastError },
}));

describe("MessageInput", () => {
  beforeEach(() => {
    state.sendMessage.mockReset();
    state.sendMessage.mockResolvedValue(undefined);
    state.toastError.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders the message textarea and send button", () => {
    render(<MessageInput />);
    expect(screen.getByRole("textbox", { name: "Message text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("keeps send disabled for empty and whitespace-only text", async () => {
    const user = userEvent.setup();
    render(<MessageInput />);
    const textarea = screen.getByRole("textbox", { name: "Message text" });

    await user.type(textarea, "   ");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it("trims text before sending", async () => {
    const user = userEvent.setup();
    render(<MessageInput />);
    await user.type(screen.getByRole("textbox", { name: "Message text" }), "  Hello Relay  ");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(state.sendMessage).toHaveBeenCalledWith({ text: "Hello Relay" });
    });
    expect(screen.getByRole("textbox", { name: "Message text" })).toHaveValue("");
  });

  it("does not send an empty form", () => {
    render(<MessageInput />);
    fireEvent.submit(screen.getByRole("textbox", { name: "Message text" }).closest("form"));
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it("preserves the draft when sending fails", async () => {
    state.sendMessage.mockRejectedValueOnce(new Error("Network unavailable"));
    const user = userEvent.setup();
    render(<MessageInput />);
    const textarea = screen.getByRole("textbox", { name: "Message text" });

    await user.type(textarea, "Retry this message");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(textarea).toHaveValue("Retry this message");
      expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("disables controls and prevents duplicate sends while a request is pending", async () => {
    let resolveSend;
    state.sendMessage.mockImplementation(
      () => new Promise((resolve) => { resolveSend = resolve; }),
    );
    const user = userEvent.setup();
    render(<MessageInput />);
    const textarea = screen.getByRole("textbox", { name: "Message text" });

    await user.type(textarea, "One message");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByRole("button", { name: "Sending message" })).toBeDisabled();
    expect(textarea).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Sending message.");
    expect(state.sendMessage).toHaveBeenCalledTimes(1);

    resolveSend();
    await waitFor(() => expect(textarea).toBeEnabled());
  });

  it("submits on Enter without Shift", async () => {
    const user = userEvent.setup();
    render(<MessageInput />);
    const textarea = screen.getByRole("textbox", { name: "Message text" });

    await user.type(textarea, "Enter to send");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(state.sendMessage).toHaveBeenCalledWith({ text: "Enter to send" });
    });
  });

  it("does not submit on Shift+Enter", async () => {
    const user = userEvent.setup();
    render(<MessageInput />);
    const textarea = screen.getByRole("textbox", { name: "Message text" });

    await user.type(textarea, "Line one");
    fireEvent.keyDown(textarea, {
      key: "Enter",
      code: "Enter",
      shiftKey: true,
      nativeEvent: { isComposing: false },
    });

    expect(state.sendMessage).not.toHaveBeenCalled();
    expect(textarea.value).toContain("Line one");
  });

  it("rejects non-image files", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<MessageInput />);
    const file = new File(["not an image"], "notes.txt", { type: "text/plain" });

    await user.upload(screen.getByLabelText("Choose an image attachment"), file);

    expect(state.toastError).toHaveBeenCalledWith("Choose a valid image file.");
    expect(screen.queryByText("Image attached")).not.toBeInTheDocument();
  });

  it("rejects images larger than 7 MB", async () => {
    const user = userEvent.setup();
    render(<MessageInput />);
    const file = new File([new Uint8Array(7 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png",
    });

    await user.upload(screen.getByLabelText("Choose an image attachment"), file);

    expect(state.toastError).toHaveBeenCalledWith("Images must be smaller than 7 MB.");
    expect(screen.queryByText("Image attached")).not.toBeInTheDocument();
  });

  it("allows selecting and removing an image attachment", async () => {
    const user = userEvent.setup();
    render(<MessageInput />);
    const file = new File(["small image"], "small.png", { type: "image/png" });

    await user.upload(screen.getByLabelText("Choose an image attachment"), file);

    expect(await screen.findByText("Image attached")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove attached image" }));
    expect(screen.queryByText("Image attached")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("sends text and an attached image together", async () => {
    const user = userEvent.setup();
    render(<MessageInput />);
    const file = new File(["small image"], "small.png", { type: "image/png" });

    await user.upload(screen.getByLabelText("Choose an image attachment"), file);
    await screen.findByText("Image attached");
    await user.type(screen.getByRole("textbox", { name: "Message text" }), "See this");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(state.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: "See this", image: expect.stringMatching(/^data:image\/png;base64,/) }),
      );
    });
    await waitFor(() => expect(screen.queryByText("Image attached")).not.toBeInTheDocument());
  });

  it("announces a successful send accessibly", async () => {
    const user = userEvent.setup();
    render(<MessageInput />);
    await user.type(screen.getByRole("textbox", { name: "Message text" }), "Status check");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Message sent successfully.");
    });
  });

  it("ignores an empty file selection", () => {
    render(<MessageInput />);
    const input = screen.getByLabelText("Choose an image attachment");

    fireEvent.change(input, { target: { files: [] } });

    expect(state.toastError).not.toHaveBeenCalled();
    expect(screen.queryByText("Image attached")).not.toBeInTheDocument();
  });

  it("shows an error when an image cannot be read", async () => {
    const readSpy = vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function () {
      this.onerror?.();
    });
    const user = userEvent.setup();
    render(<MessageInput />);
    const file = new File(["image"], "broken.png", { type: "image/png" });

    await user.upload(screen.getByLabelText("Choose an image attachment"), file);

    expect(state.toastError).toHaveBeenCalledWith("Could not read the selected image.");
    expect(screen.queryByText("Image attached")).not.toBeInTheDocument();
    readSpy.mockRestore();
  });

  it("shows an error when the preview result is not a string", async () => {
    const readSpy = vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function () {
      Object.defineProperty(this, "result", { configurable: true, value: null });
      this.onload?.();
    });
    const user = userEvent.setup();
    render(<MessageInput />);
    const file = new File(["image"], "unknown.png", { type: "image/png" });

    await user.upload(screen.getByLabelText("Choose an image attachment"), file);

    expect(state.toastError).toHaveBeenCalledWith("Could not preview this image.");
    expect(screen.queryByText("Image attached")).not.toBeInTheDocument();
    readSpy.mockRestore();
  });

  it("opens the file picker from the attachment button", async () => {
    const user = userEvent.setup();
    render(<MessageInput />);
    const input = screen.getByLabelText("Choose an image attachment");
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});

    await user.click(screen.getByRole("button", { name: "Attach an image" }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it("ignores duplicate submissions while sending", async () => {
    let resolveSend;
    state.sendMessage.mockImplementation(
      () => new Promise((resolve) => { resolveSend = resolve; }),
    );
    const user = userEvent.setup();
    render(<MessageInput />);
    const textarea = screen.getByRole("textbox", { name: "Message text" });

    await user.type(textarea, "Send once");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    fireEvent.submit(textarea.closest("form"));

    expect(state.sendMessage).toHaveBeenCalledTimes(1);
    resolveSend();
    await waitFor(() => expect(textarea).toBeEnabled());
  });

});
