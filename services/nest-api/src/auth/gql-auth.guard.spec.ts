import { UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthUserService } from './auth-user.service.js';
import { GqlAuthGuard } from './gql-auth.guard.js';
import { JwtAuthService } from './jwt-auth.service.js';

describe('GqlAuthGuard', () => {
  const userId = '507f1f77bcf86cd799439011';
  const verifyToken = vi.fn((token?: string) => {
    if (!token) throw new UnauthorizedException('Authentication required');
    return userId;
  });
  const exists = vi.fn();
  let guard: GqlAuthGuard;

  const activateWithRequest = async (req: Request) => {
    vi.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => ({ req }),
    } as never);

    return guard.canActivate({} as never);
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    exists.mockResolvedValue(true);
    guard = new GqlAuthGuard(
      { verifyToken } as unknown as JwtAuthService,
      { exists } as unknown as AuthUserService,
    );
  });

  it('authenticates a mobile bearer token and attaches the verified user', async () => {
    const req = {
      headers: { authorization: 'Bearer mobile-token' },
      cookies: {},
    } as unknown as Request;

    await expect(activateWithRequest(req)).resolves.toBe(true);
    expect(verifyToken).toHaveBeenCalledWith('mobile-token');
    expect(exists).toHaveBeenCalledWith(userId);
    expect((req as Request & { user?: { id: string } }).user).toEqual({ id: userId });
  });

  it('continues to authenticate with the existing JWT cookie', async () => {
    const req = {
      headers: {},
      cookies: { jwt: 'cookie-token' },
    } as unknown as Request;

    await expect(activateWithRequest(req)).resolves.toBe(true);
    expect(verifyToken).toHaveBeenCalledWith('cookie-token');
  });

  it('rejects requests without a cookie or bearer token', async () => {
    const req = {
      headers: {},
      cookies: {},
    } as unknown as Request;

    await expect(activateWithRequest(req)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verifyToken).toHaveBeenCalledWith(undefined);
    expect(exists).not.toHaveBeenCalled();
  });

  it('rejects a valid token when the account no longer exists', async () => {
    exists.mockResolvedValue(false);
    const req = {
      headers: { authorization: 'Bearer mobile-token' },
      cookies: {},
    } as unknown as Request;

    await expect(activateWithRequest(req)).rejects.toThrow(
      UnauthorizedException,
    );
    expect((req as Request & { user?: { id: string } }).user).toBeUndefined();
  });
});
