// Use a dedicated MongoDB database for all E2E tests.
// Do not let a developer's local .env redirect tests to application data.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27018/chatapp_test';
process.env.JWT_SECRET =
  'e2e-test-secret-that-is-at-least-32-characters';
