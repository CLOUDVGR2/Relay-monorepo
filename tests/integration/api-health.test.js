/**
 * Integration test for API health endpoints
 * Tests that all services are responding correctly
 */

const http = require("http");

function checkHealth(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

describe("API Health Integration Tests", () => {
  const services = [
    { name: "Backend (Express)", url: "http://localhost:5001/api/health/live" },
    { name: "NestJS API", url: "http://localhost:3000/health" },
    { name: "Go API", url: "http://localhost:8081/readyz" },
    { name: "Python AI", url: "http://localhost:8000/readyz" },
  ];

  services.forEach((service) => {
    test(`${service.name} should be healthy`, async () => {
      if (!process.env.RUN_INTEGRATION_TESTS) {
        console.log(`Skipping ${service.name} health check - set RUN_INTEGRATION_TESTS=1`);
        return;
      }

      try {
        const result = await checkHealth(service.url);
        expect(result.status).toBe(200);
        console.log(`${service.name} is healthy:`, result.body);
      } catch (error) {
        console.error(`${service.name} health check failed:`, error.message);
        throw error;
      }
    }, 10000);
  });
});
