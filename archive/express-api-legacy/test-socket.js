/** Test socket module for the Relay archived legacy Express implementation. */

import { readFileSync } from "node:fs";
import { io } from "socket.io-client";

const lines = readFileSync("cookies.txt", "utf8").split(/\r?\n/);

const line = lines.find((entry) => {
  if (entry.startsWith("#") && !entry.startsWith("#HttpOnly_")) {
    return false;
  }

  return entry.trim().split(/\s+/)[5] === "jwt";
});

if (!line) {
  console.error("JWT cookie not found in cookies.txt");
  process.exit(1);
}

const fields = line.trim().split(/\s+/);
const cookie = `${fields[5]}=${fields[6]}`;

const socket = io("http://localhost:5001", {
  extraHeaders: {
    Cookie: cookie,
  },
  timeout: 5000,
});

const timeout = setTimeout(() => {
  console.error("Socket connection timed out");
  socket.close();
  process.exit(1);
}, 8000);

socket.on("connect", () => {
  clearTimeout(timeout);
  console.log("Socket.IO connection successful");
  console.log("Authenticated socket ID:", socket.id);
  socket.disconnect();
  process.exit(0);
});

socket.on("connect_error", (error) => {
  clearTimeout(timeout);
  console.error("Socket.IO connection failed:", error.message);
  socket.close();
  process.exit(1);
});
