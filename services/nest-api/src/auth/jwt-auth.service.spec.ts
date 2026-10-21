/** Tests for jwt auth service spec in the nest api. */

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthService } from './jwt-auth.service.js';

describe('JwtAuthService', () => {
  const secret = 'test-only-secret-with-at-least-32-characters';
  const userId = '507f1f77bcf86cd799439011';

  // Supply a predictable secret without depending on a real .env file.
  const configService = {
    getOrThrow: vi.fn(() => secret),
  } as unknown as ConfigService;

  const service = new JwtAuthService(configService);

  it('accepts a valid Express-compatible HS256 token', () => {
    const token = jwt.sign({ userId }, secret, { expiresIn: '7d' });

    expect(service.verifyToken(token)).toBe(userId);
  });

  it('rejects a missing token', () => {
    expect(() => service.verifyToken(undefined)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with a different secret', () => {
    const token = jwt.sign(
      { userId },
      'different-secret-with-at-least-32-characters',
    );

    expect(() => service.verifyToken(token)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', () => {
    const token = jwt.sign(
      { userId },
      secret,
      { expiresIn: -1 },
    );

    expect(() => service.verifyToken(token)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with an invalid user ID', () => {
    const token = jwt.sign({ userId: 'not-a-mongodb-object-id' }, secret);

    expect(() => service.verifyToken(token)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token without a user ID', () => {
    const token = jwt.sign({ role: 'user' }, secret);

    expect(() => service.verifyToken(token)).toThrow(
      UnauthorizedException,
    );
  });
});
