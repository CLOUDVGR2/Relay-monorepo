/**
 * End-to-end tests for registration, login, and authenticated API access.
 */
const http = require("http");

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
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: JSON.parse(data),
            });
          } catch {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data,
            });
          }
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

describe("Full Application Flow E2E", () => {
  const BASE_URL = "http://localhost:5001/api";
  const password = "TestPassword123!";

  let testEmail;
  let authCookie;
  let userId;

  const integrationEnabled = Boolean(process.env.RUN_INTEGRATION_TESTS);

  beforeAll(() => {
    if (!integrationEnabled) {
      console.log(
        "Skipping live E2E requests - set RUN_INTEGRATION_TESTS=1 to run",
      );
    }
  });

  test("should register a new user", async () => {
    if (!integrationEnabled) return;

    testEmail = `test-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}@example.com`;

    const response = await makeRequest(`${BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        email: testEmail,
        password,
        fullName: "Integration Test User",
      },
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty("_id");
    expect(response.body).toHaveProperty("email", testEmail);
    expect(response.body).not.toHaveProperty("password");

    userId = response.body._id;

    const cookies = response.headers["set-cookie"];
    expect(cookies).toBeDefined();

    const jwtCookie = cookies.find((cookie) => cookie.startsWith("jwt="));
    expect(jwtCookie).toBeDefined();

    authCookie = jwtCookie.split(";")[0];
  });

  test("should login with the registered user's credentials", async () => {
    if (!integrationEnabled) return;

    expect(testEmail).toBeDefined();

    const response = await makeRequest(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        email: testEmail,
        password,
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("_id", userId);
    expect(response.body).toHaveProperty("email", testEmail);

    const cookies = response.headers["set-cookie"];
    expect(cookies).toBeDefined();

    const jwtCookie = cookies.find((cookie) => cookie.startsWith("jwt="));
    expect(jwtCookie).toBeDefined();

    authCookie = jwtCookie.split(";")[0];
  });

  test("should return the current user with a valid JWT cookie", async () => {
    if (!integrationEnabled) return;

    const response = await makeRequest(`${BASE_URL}/auth/check`, {
      headers: { Cookie: authCookie },
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("_id", userId);
    expect(response.body).toHaveProperty("email", testEmail);
  });

  test("should return users for the authenticated sidebar", async () => {
    if (!integrationEnabled) return;

    const response = await makeRequest(`${BASE_URL}/messages/users`, {
      headers: { Cookie: authCookie },
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
