/** Tests for auth user service spec in the nest api. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { AuthUserService } from './auth-user.service.js';

describe('AuthUserService', () => {
  const execFindById = vi.fn();
  const execFind = vi.fn();

  const selectById = vi.fn();
  const leanById = vi.fn();
  const selectFind = vi.fn();
  const leanFind = vi.fn();

  const users = {
    findById: vi.fn(),
    find: vi.fn(),
  };

  let service: AuthUserService;

  beforeEach(() => {
    vi.clearAllMocks();

    selectById.mockReturnValue({ lean: leanById });
    leanById.mockReturnValue({ exec: execFindById });

    selectFind.mockReturnValue({ lean: leanFind });
    leanFind.mockReturnValue({ exec: execFind });

    users.findById.mockReturnValue({ select: selectById });
    users.find.mockReturnValue({ select: selectFind });

    service = new AuthUserService(users as never);
  });

  describe('exists', () => {
    it('returns true when the account exists', async () => {
      execFindById.mockResolvedValue({ _id: 'existing-user' });

      await expect(service.exists('existing-user')).resolves.toBe(true);
      expect(users.findById).toHaveBeenCalledWith('existing-user');
      expect(selectById).toHaveBeenCalledWith('_id');
    });

    it('returns false when the account does not exist', async () => {
      execFindById.mockResolvedValue(null);

      await expect(service.exists('deleted-user')).resolves.toBe(false);
    });
  });

  describe('findExistingUserIds', () => {
    it('returns existing IDs normalized to lowercase', async () => {
      const id = new Types.ObjectId();

      execFind.mockResolvedValue([{ _id: id }]);

      const result = await service.findExistingUserIds([
        id.toString().toUpperCase(),
      ]);

      expect(result).toEqual([id.toString().toLowerCase()]);
      expect(users.find).toHaveBeenCalledWith({
        _id: { $in: [expect.any(Types.ObjectId)] },
      });
      expect(selectFind).toHaveBeenCalledWith('_id');
    });

    it('returns an empty array without querying MongoDB for empty input', async () => {
      await expect(service.findExistingUserIds([])).resolves.toEqual([]);

      expect(users.find).not.toHaveBeenCalled();
    });

    it('excludes accounts that do not exist', async () => {
      const existingId = new Types.ObjectId();
      const missingId = new Types.ObjectId();

      execFind.mockResolvedValue([{ _id: existingId }]);

      const result = await service.findExistingUserIds([
        existingId.toString(),
        missingId.toString(),
      ]);

      expect(result).toEqual([existingId.toString()]);
    });

    it('rejects malformed MongoDB ObjectIds', async () => {
      await expect(
        service.findExistingUserIds(['not-a-valid-object-id']),
      ).rejects.toThrow();

      expect(users.find).not.toHaveBeenCalled();
    });
  });
});
