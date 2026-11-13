/** Tests for env validation spec in the nest api. */

import { validateEnvironment } from './env.validation.js';

const validStorageConfig = {
  CALL_RECORDING_STORAGE_BUCKET: 'relay-call-recordings',
  CALL_RECORDING_STORAGE_REGION: 'us-east-1',
  CALL_RECORDING_STORAGE_ACCESS_KEY_ID: 'test-access-key',
  CALL_RECORDING_STORAGE_SECRET_ACCESS_KEY: 'test-secret-key',
  CALL_RECORDING_STORAGE_ENDPOINT: 'http://minio:9000',
  CALL_RECORDING_STORAGE_FORCE_PATH_STYLE: 'true',
};

const validConfig = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/chatapp',
  MONGODB_URI: 'mongodb://localhost:27017/chatapp',
  JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
};

describe('validateEnvironment', () => {
  it('should apply safe defaults when optional values are missing', () => {
    const result = validateEnvironment(validConfig);

    expect(result['PORT']).toBe(3000);
    expect(result['NODE_ENV']).toBe('development');
    expect(result['REDIS_URL']).toBe('redis://127.0.0.1:6379');
  });

  it('should accept a valid port and environment', () => {
    const result = validateEnvironment({
      ...validConfig,
      ...validStorageConfig,
      CALL_RECORDING_STORAGE_PUBLIC_ENDPOINT: 'https://storage.example.com',
      PORT: '8080',
      NODE_ENV: 'production',
      CLIENT_URL: 'https://example.com',
      REDIS_URL: 'rediss://redis.example.com:6380',
    });

    expect(result['PORT']).toBe(8080);
    expect(result['NODE_ENV']).toBe('production');
  });

  it('should require REDIS_URL in production', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        NODE_ENV: 'production',
        CLIENT_URL: 'https://example.com',
      }),
    ).toThrow('REDIS_URL must be configured in production.');
  });

  it('should accept a secure Redis URL', () => {
    const result = validateEnvironment({
      ...validConfig,
      REDIS_URL: 'rediss://redis.example.com:6380',
    });

    expect(result['REDIS_URL']).toBe('rediss://redis.example.com:6380');
  });

  it('should reject an unsupported Redis URL scheme', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        REDIS_URL: 'https://redis.example.com',
      }),
    ).toThrow(
      'REDIS_URL must be a valid redis:// or rediss:// connection URL.',
    );
  });

  it('should reject a port below the valid range', () => {
    expect(() => validateEnvironment({ ...validConfig, PORT: '0' })).toThrow(
      'PORT must be an integer between 1 and 65535.',
    );
  });

  it('should reject a port above the valid range', () => {
    expect(() =>
      validateEnvironment({ ...validConfig, PORT: '65536' }),
    ).toThrow('PORT must be an integer between 1 and 65535.');
  });

  it('should reject a non-numeric port', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        PORT: 'not-a-port',
      }),
    ).toThrow('PORT must be an integer between 1 and 65535.');
  });

  it('should reject an unsupported NODE_ENV', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        NODE_ENV: 'staging',
      }),
    ).toThrow('NODE_ENV must be development, test, or production.');
  });

  it('should require DATABASE_URL', () => {
    const { DATABASE_URL: _unused, ...config } = validConfig;

    expect(() => validateEnvironment(config)).toThrow(
      'DATABASE_URL is required and must be a non-empty string.',
    );
  });

  it('should accept a PostgreSQL URL using the postgres scheme', () => {
    const result = validateEnvironment({
      ...validConfig,
      DATABASE_URL: 'postgres://user:password@localhost:5432/chatapp',
    });

    expect(result['DATABASE_URL']).toBe(
      'postgres://user:password@localhost:5432/chatapp',
    );
  });

  it('should reject an unsupported PostgreSQL URL scheme', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        DATABASE_URL: 'https://example.com/chatapp',
      }),
    ).toThrow('DATABASE_URL must use the postgresql:// or postgres:// scheme.');
  });

  it('should reject a malformed PostgreSQL URL', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        DATABASE_URL: 'not-a-database-uri',
      }),
    ).toThrow('DATABASE_URL must be a valid PostgreSQL connection URL.');
  });

  it('should reject a PostgreSQL URL without a database name', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        DATABASE_URL: 'postgresql://user:password@localhost:5432',
      }),
    ).toThrow('DATABASE_URL must include a hostname and database name.');
  });

  it('should require MONGODB_URI', () => {
    const { MONGODB_URI: _unused, ...config } = validConfig;

    expect(() => validateEnvironment(config)).toThrow(
      'MONGODB_URI is required and must be a non-empty string.',
    );
  });

  it('should accept a MongoDB SRV URL', () => {
    const result = validateEnvironment({
      ...validConfig,
      MONGODB_URI: 'mongodb+srv://user:password@example.mongodb.net/chatapp',
    });

    expect(result['MONGODB_URI']).toBe(
      'mongodb+srv://user:password@example.mongodb.net/chatapp',
    );
  });

  it('should reject an unsupported MongoDB URL scheme', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        MONGODB_URI: 'https://example.com/chatapp',
      }),
    ).toThrow('MONGODB_URI must use the mongodb:// or mongodb+srv:// scheme.');
  });

  it('should reject a MongoDB URL without a hostname', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        MONGODB_URI: 'mongodb:///chatapp',
      }),
    ).toThrow('MONGODB_URI must include a hostname.');
  });

  it('should require JWT_SECRET', () => {
    const { JWT_SECRET: _unused, ...config } = validConfig;

    expect(() => validateEnvironment(config)).toThrow(
      'JWT_SECRET is required and must be a non-empty string.',
    );
  });

  it('should reject a JWT secret shorter than 32 characters', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        JWT_SECRET: 'too-short',
      }),
    ).toThrow('JWT_SECRET must be at least 32 characters long.');
  });

  it('should accept a JWT secret of at least 32 characters', () => {
    const result = validateEnvironment(validConfig);

    expect(result['JWT_SECRET']).toBe(validConfig.JWT_SECRET);
  });

  it('requires call-recording storage configuration in production', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        NODE_ENV: 'production',
        CLIENT_URL: 'https://example.com',
        REDIS_URL: 'redis://redis.example.com:6379',
      }),
    ).toThrow(
      'Call-recording storage bucket and region must be configured in production.',
    );
  });

  it('accepts complete private call-recording storage settings', () => {
    const result = validateEnvironment({
      ...validConfig,
      ...validStorageConfig,
    });

    expect(result['CALL_RECORDING_STORAGE_FORCE_PATH_STYLE']).toBe(true);
  });

  it('rejects incomplete call-recording storage credentials', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        CALL_RECORDING_STORAGE_BUCKET: 'relay-call-recordings',
      }),
    ).toThrow(
      'Call-recording storage bucket and region must be configured together.',
    );
  });

  it('rejects a storage endpoint containing a path', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        ...validStorageConfig,
        CALL_RECORDING_STORAGE_ENDPOINT: 'http://minio:9000/private',
      }),
    ).toThrow(
      'CALL_RECORDING_STORAGE_ENDPOINT must be a valid HTTP(S) origin without credentials, path, query, or fragment.',
    );
  });

  it('rejects a public storage endpoint containing a path', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        ...validStorageConfig,
        CALL_RECORDING_STORAGE_PUBLIC_ENDPOINT:
          'https://storage.example.com/private',
      }),
    ).toThrow(
      'CALL_RECORDING_STORAGE_PUBLIC_ENDPOINT must be a valid HTTP(S) origin without credentials, path, query, or fragment.',
    );
  });

  it('accepts production AWS storage with IAM credentials and no public endpoint', () => {
    const result = validateEnvironment({
      ...validConfig,
      NODE_ENV: 'production',
      CLIENT_URL: 'https://example.com',
      REDIS_URL: 'redis://redis.example.com:6379',
      CALL_RECORDING_STORAGE_BUCKET: 'relay-call-recordings',
      CALL_RECORDING_STORAGE_REGION: 'us-east-1',
    });

    expect(result['CALL_RECORDING_STORAGE_BUCKET']).toBe('relay-call-recordings');
    expect(result['CALL_RECORDING_STORAGE_REGION']).toBe('us-east-1');
    expect(result['CALL_RECORDING_STORAGE_FORCE_PATH_STYLE']).toBe(false);
  });

  it('rejects static storage credentials when only one is configured', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        CALL_RECORDING_STORAGE_BUCKET: 'relay-call-recordings',
        CALL_RECORDING_STORAGE_REGION: 'us-east-1',
        CALL_RECORDING_STORAGE_ACCESS_KEY_ID: 'test-access-key',
      }),
    ).toThrow(
      'CALL_RECORDING_STORAGE_ACCESS_KEY_ID and CALL_RECORDING_STORAGE_SECRET_ACCESS_KEY must be configured together.',
    );
  });

  it('rejects an invalid path-style setting', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        ...validStorageConfig,
        CALL_RECORDING_STORAGE_FORCE_PATH_STYLE: 'yes',
      }),
    ).toThrow('CALL_RECORDING_STORAGE_FORCE_PATH_STYLE must be true or false.');
  });

  it('allows call-event integration settings to be omitted', () => {
    expect(() => validateEnvironment(validConfig)).not.toThrow();
  });

  it('requires the call-event token when a base URL is configured', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        CALL_EVENTS_BASE_URL: 'http://express-api:5001',
      }),
    ).toThrow(
      'CALL_EVENTS_INTERNAL_TOKEN is required and must be a non-empty string.',
    );
  });

  it('requires the call-event base URL when a token is configured', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        CALL_EVENTS_INTERNAL_TOKEN: 'a-test-internal-token',
      }),
    ).toThrow(
      'CALL_EVENTS_BASE_URL is required when configuring call-event integration.',
    );
  });

  it('rejects a call-event base URL containing a path', () => {
    expect(() =>
      validateEnvironment({
        ...validConfig,
        CALL_EVENTS_BASE_URL: 'http://express-api:5001/internal',
        CALL_EVENTS_INTERNAL_TOKEN: 'a-test-internal-token',
      }),
    ).toThrow(
      'CALL_EVENTS_BASE_URL must be a valid HTTP(S) origin without credentials, path, query, or fragment.',
    );
  });

  it('accepts a valid call-event integration configuration', () => {
    const result = validateEnvironment({
      ...validConfig,
      CALL_EVENTS_BASE_URL: 'http://express-api:5001',
      CALL_EVENTS_INTERNAL_TOKEN: 'a-test-internal-token',
    });

    expect(result['CALL_EVENTS_BASE_URL']).toBe('http://express-api:5001');
  });
});
