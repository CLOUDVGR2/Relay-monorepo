/** Test socket module for the Relay archived legacy Express implementation. */

import "dotenv/config";

import { io as createSocket } from "socket.io-client";
import { readFile } from "node:fs/promises";

const SERVER_URL = process.env.SOCKET_TEST_URL ?? "http://localhost:5001";
const COOKIE_FILE = new URL("../cookies.txt", import.meta.url);

function getJwtCookie(contents) {
  const line = contents.split(/\r?\n/).find((entry) => {
    if (entry.startsWith("#") && !entry.startsWith("#HttpOnly_")) {
      return false;
    }

    const fields = entry.split("\t");
    return fields[5] === "jwt" && Boolean(fields[6]);
  });

  if (!line) {
    throw new Error("No JWT cookie found in cookies.txt");
  }

  const fields = line.split("\t");
  return `jwt=${fields[6]}`;
}

async function main() {
  const cookieContents = await readFile(COOKIE_FILE, "utf8");
  const cookie = getJwtCookie(cookieContents);

  const socket = createSocket(SERVER_URL, {
    extraHeaders: { Cookie: cookie },
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000,
  });

  const timeout = setTimeout(() => {
    console.error("Socket connection timed out.");
    socket.disconnect();
    process.exitCode = 1;
  }, 8000);

  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
    console.log("Listening for getOnlineUsers and newMessage...");
  });

  socket.on("getOnlineUsers", (userIds) => {
    console.log("Online users:", userIds);
  });

  socket.on("newMessage", (message) => {
    console.log("Received newMessage event:");
    console.log(JSON.stringify(message, null, 2));
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection failed:", error.message);
    clearTimeout(timeout);
    socket.disconnect();
    process.exitCode = 1;
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);
  });

  process.on("SIGINT", () => {
    clearTimeout(timeout);
    socket.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Socket test failed:", error.message);
  process.exitCode = 1;
});
