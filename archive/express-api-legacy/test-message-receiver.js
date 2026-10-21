/** Test message receiver module for the Relay archived legacy Express implementation. */

import { readFileSync } from "node:fs";
import { io } from "socket.io-client";

const lines = readFileSync("recipient-cookies.txt", "utf8")
  .split(/\r?\n/);

const line = lines.find((entry) => {
  if (entry.startsWith("#") && !entry.startsWith("#HttpOnly_")) {
    return false;
  }

  return entry.trim().split(/\s+/)[5] === "jwt";
});

if (!line) {
  console.error("Recipient JWT cookie not found");
  process.exit(1);
}

const fields = line.trim().split(/\s+/);
const cookie = `${fields[5]}=${fields[6]}`;

const socket = io("http://localhost:5001", {
  extraHeaders: { Cookie: cookie },
  timeout: 5000,
});

socket.on("connect", () => {
  console.log("Recipient connected:", socket.id);
  console.log("Listening for newMessage events. Press Ctrl+C to stop.");
});

socket.on("newMessage", (message) => {
  console.log("\nReceived newMessage event:");
  console.log(JSON.stringify(message, null, 2));
});

socket.on("connect_error", (error) => {
  console.error("Connection failed:", error.message);
});

process.on("SIGINT", () => {
  socket.disconnect();
  process.exit(0);
});
