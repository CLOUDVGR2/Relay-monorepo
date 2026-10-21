/**
 * Socket.IO integration tests using a real authenticated session.
 * Requires the Express backend and its database to be running.
 */
import { io } from "socket.io-client";
import http from "node:http";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5001";
const API_URL = `${BACKEND_URL}/api`;

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          let body;

          try {
            body = JSON.parse(data);
          } catch {
            body = data;
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
          });
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error("Request timed out"));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "Backend Socket.IO Integration",
  () => {
    let socket;
    let authCookie;

    beforeAll(async () => {
      const email = `socket-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}@example.com`;

      const response = await makeRequest(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          fullName: "Socket Integration User",
          email,
          password: "TestPassword123!",
        },
      });

      if (response.status !== 201) {
        throw new Error(
          `Could not create socket test user: HTTP ${response.status}; ` +
            `${JSON.stringify(response.body)}`,
        );
      }

      const cookies = response.headers["set-cookie"] || [];
      const jwtCookie = cookies.find((cookie) => cookie.startsWith("jwt="));

      if (!jwtCookie) {
        throw new Error("Signup succeeded but did not issue a JWT cookie");
      }

      authCookie = jwtCookie.split(";")[0];
    });

    let onlineUsersPromise;

    beforeEach(async () => {
      socket = io(BACKEND_URL, {
        transports: ["websocket"],
        reconnection: false,
        autoConnect: false,
        extraHeaders: {
          Cookie: authCookie,
        },
      });

      onlineUsersPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Timed out waiting for getOnlineUsers")),
          10000,
        );

        socket.once("getOnlineUsers", (onlineUsers) => {
          clearTimeout(timeout);
          resolve(onlineUsers);
        });

        socket.once("connect_error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
        socket.connect();
      });
    }, 15000);

    afterEach(() => {
      if (socket) {
        socket.disconnect();
        socket = undefined;
      }
    });

    test("should connect to the server with valid authentication", () => {
      expect(socket.connected).toBe(true);
    });

    test("should receive the online users event", async () => {
      const users = await onlineUsersPromise;

      expect(Array.isArray(users)).toBe(true);
    }, 15000);
  },
);
