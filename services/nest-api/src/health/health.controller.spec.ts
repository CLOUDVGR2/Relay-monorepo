/** Tests for health controller spec in the nest api. */

import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockConnection: {
    db: {
      admin: () => {
        ping: () => Promise<{ ok: number }>;
      };
    } | undefined;
  };
  let mockPing: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockPing = vi.fn().mockResolvedValue({ ok: 1 });

    mockConnection = {
      db: {
        admin: () => ({
          ping: mockPing,
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getConnectionToken(),
          useValue: mockConnection as unknown as Connection,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should report that the API process is alive', () => {
    expect(controller.checkHealth()).toEqual({
      status: 'ok',
    });
  });

  it('should report database readiness when MongoDB responds', async () => {
    await expect(controller.checkReadiness()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'ok' },
    });

    expect(mockPing).toHaveBeenCalledOnce();
  });

  it('should report unavailable when MongoDB ping fails', async () => {
    mockPing.mockRejectedValueOnce(new Error('Database unavailable'));

    await expect(controller.checkReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('should report unavailable when no database connection exists', async () => {
    mockConnection.db = undefined;

    await expect(controller.checkReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
