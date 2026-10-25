/**
 * Validates environment variables before the application starts.
 *
 * Invalid configuration should fail fast instead of allowing the
 * application to start with an unsafe or unexpected configuration.
 */
export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const rawPort = config['PORT'] ?? '3000';
  const port = Number(rawPort);

  if (
    typeof rawPort !== 'string' &&
    typeof rawPort !== 'number'
  ) {
    throw new Error('PORT must be a valid integer.');
  }

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      'PORT must be an integer between 1 and 65535.',
    );
  }

  const nodeEnv = config['NODE_ENV'] ?? 'development';

  if (
    nodeEnv !== 'development' &&
    nodeEnv !== 'test' &&
    nodeEnv !== 'production'
  ) {
    throw new Error(
      'NODE_ENV must be development, test, or production.',
    );
  }

  const rawRedisUrl = config['REDIS_URL'];
  let redisUrl: string;

  if (rawRedisUrl === undefined || rawRedisUrl === null || rawRedisUrl === '') {
    if (nodeEnv === 'production') {
      throw new Error('REDIS_URL must be configured in production.');
    }

    redisUrl = 'redis://127.0.0.1:6379';
  } else {
    if (typeof rawRedisUrl !== 'string' || !rawRedisUrl.trim()) {
      throw new Error('REDIS_URL must be a valid Redis connection URL.');
    }

    redisUrl = rawRedisUrl.trim();

    try {
      const parsedRedisUrl = new URL(redisUrl);

      if (
        !['redis:', 'rediss:'].includes(parsedRedisUrl.protocol) ||
        !parsedRedisUrl.hostname ||
        !['', '/'].includes(parsedRedisUrl.pathname) ||
        parsedRedisUrl.search ||
        parsedRedisUrl.hash
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(
        'REDIS_URL must be a valid redis:// or rediss:// connection URL.',
      );
    }
  }

  // Require an explicit frontend origin in production deployments.
  const clientUrl = config['CLIENT_URL'];

  if (nodeEnv === 'production' &&
      (typeof clientUrl !== 'string' || !clientUrl.trim())) {
    throw new Error('CLIENT_URL must be configured in production.');
  }

  // Validate configured frontend origins before enabling credentialed CORS.
  if (clientUrl !== undefined) {
    if (typeof clientUrl !== 'string' || !clientUrl.trim()) {
      throw new Error('CLIENT_URL must be a non-empty string when provided.');
    }

    for (const origin of clientUrl.split(',')) {
      try {
        const parsedOrigin = new URL(origin.trim());

        if (
          !['http:', 'https:'].includes(parsedOrigin.protocol) ||
          parsedOrigin.origin !== origin.trim()
        ) {
          throw new Error();
        }
      } catch {
        throw new Error('CLIENT_URL must contain valid comma-separated origins.');
      }
    }
  }

  const databaseUrl = requireNonEmptyString(
    config['DATABASE_URL'],
    'DATABASE_URL',
  );

  let parsedDatabaseUrl: URL;

  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL must be a valid PostgreSQL connection URL.',
    );
  }

  if (
    parsedDatabaseUrl.protocol !== 'postgresql:' &&
    parsedDatabaseUrl.protocol !== 'postgres:'
  ) {
    throw new Error(
      'DATABASE_URL must use the postgresql:// or postgres:// scheme.',
    );
  }

  if (
    !parsedDatabaseUrl.hostname ||
    !parsedDatabaseUrl.pathname.slice(1)
  ) {
    throw new Error(
      'DATABASE_URL must include a hostname and database name.',
    );
  }

  const mongoUri = requireNonEmptyString(
    config['MONGODB_URI'],
    'MONGODB_URI',
  );

  let parsedMongoUri: URL;

  try {
    parsedMongoUri = new URL(mongoUri);
  } catch {
    throw new Error(
      'MONGODB_URI must be a valid MongoDB connection URL.',
    );
  }

  if (
    parsedMongoUri.protocol !== 'mongodb:' &&
    parsedMongoUri.protocol !== 'mongodb+srv:'
  ) {
    throw new Error(
      'MONGODB_URI must use the mongodb:// or mongodb+srv:// scheme.',
    );
  }

  if (!parsedMongoUri.hostname) {
    throw new Error(
      'MONGODB_URI must include a hostname.',
    );
  }

  const jwtSecret = requireNonEmptyString(
    config['JWT_SECRET'],
    'JWT_SECRET',
  );

  if (jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long.',
    );
  }

  // Validate the optional Go job-service integration.
  const goBaseUrl = config['GO_API_BASE_URL'];
  const goToken = config['INTERNAL_API_TOKEN'];

  if (goBaseUrl !== undefined || goToken !== undefined) {
    if (typeof goBaseUrl !== 'string' || !goBaseUrl.trim()) {
      throw new Error(
        'GO_API_BASE_URL is required when configuring the Go integration.',
      );
    }

    requireNonEmptyString(goToken, 'INTERNAL_API_TOKEN');

    try {
      const parsedGoUrl = new URL(goBaseUrl);

      if (
        !['http:', 'https:'].includes(parsedGoUrl.protocol) ||
        !parsedGoUrl.hostname ||
        parsedGoUrl.username ||
        parsedGoUrl.password ||
        parsedGoUrl.search ||
        parsedGoUrl.hash ||
        parsedGoUrl.pathname !== '/'
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(
        'GO_API_BASE_URL must be a valid HTTP(S) origin without credentials, path, query, or fragment.',
      );
    }
  }

  const aiBaseUrl = config['PYTHON_AI_BASE_URL'];
  const aiToken = config['PYTHON_AI_INTERNAL_TOKEN'];

  if (aiBaseUrl !== undefined || aiToken !== undefined) {
    if (typeof aiBaseUrl !== 'string' || !aiBaseUrl.trim()) {
      throw new Error(
        'PYTHON_AI_BASE_URL is required when configuring AI integration.',
      );
    }

    if (typeof aiToken !== 'string' || !aiToken.trim()) {
      throw new Error(
        'PYTHON_AI_INTERNAL_TOKEN is required when configuring AI integration.',
      );
    }

    try {
      const parsedAIUrl = new URL(aiBaseUrl);

      if (
        !['http:', 'https:'].includes(parsedAIUrl.protocol) ||
        !parsedAIUrl.hostname ||
        parsedAIUrl.username ||
        parsedAIUrl.password ||
        parsedAIUrl.search ||
        parsedAIUrl.hash ||
        parsedAIUrl.pathname !== '/'
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(
        'PYTHON_AI_BASE_URL must be a valid HTTP(S) origin without credentials, path, query, or fragment.',
      );
    }
  }

  // Validate the optional Express call-event integration.
  const callEventsBaseUrl = config['CALL_EVENTS_BASE_URL'];
  const callEventsToken = config['CALL_EVENTS_INTERNAL_TOKEN'];

  if (callEventsBaseUrl !== undefined || callEventsToken !== undefined) {
    if (
      typeof callEventsBaseUrl !== 'string' ||
      !callEventsBaseUrl.trim()
    ) {
      throw new Error(
        'CALL_EVENTS_BASE_URL is required when configuring call-event integration.',
      );
    }

    requireNonEmptyString(
      callEventsToken,
      'CALL_EVENTS_INTERNAL_TOKEN',
    );

    try {
      const parsedCallEventsUrl = new URL(callEventsBaseUrl);

      if (
        !['http:', 'https:'].includes(parsedCallEventsUrl.protocol) ||
        !parsedCallEventsUrl.hostname ||
        parsedCallEventsUrl.username ||
        parsedCallEventsUrl.password ||
        parsedCallEventsUrl.search ||
        parsedCallEventsUrl.hash ||
        parsedCallEventsUrl.pathname !== '/'
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(
        'CALL_EVENTS_BASE_URL must be a valid HTTP(S) origin without credentials, path, query, or fragment.',
      );
    }
  }

  return {
    ...config,
    PORT: port,
    NODE_ENV: nodeEnv,
    REDIS_URL: redisUrl,
  };
}

function requireNonEmptyString(
  value: unknown,
  name: string,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required and must be a non-empty string.`);
  }

  return value;
}
