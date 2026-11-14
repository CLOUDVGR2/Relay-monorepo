import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { HttpAuthGuard } from '../auth/http-auth.guard.js';
import { AIController } from './ai.controller.js';
import { AIService } from './ai.service.js';

describe('AIController', () => {
  const userId = 'authenticated-user-123';

  const answer = {
    answer: 'The workshop closes at 7 PM on Thursdays.',
    citations: [],
  };

  it('uses the authenticated request user ID for knowledge-base retrieval', async () => {
    const aiService = {
      answerQuestion: vi.fn().mockResolvedValue(answer),
    };

    const controller = new AIController(aiService as unknown as AIService);

    const result = await controller.answer(
      { question: 'When does the workshop close?', top_k: 5 },
      { user: { id: userId } } as never,
    );

    expect(result).toEqual(answer);
    expect(aiService.answerQuestion).toHaveBeenCalledOnce();
    expect(aiService.answerQuestion).toHaveBeenCalledWith(
      'When does the workshop close?',
      5,
      userId,
    );
  });

  it('requires the HTTP authentication guard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AIController);

    expect(guards).toContain(HttpAuthGuard);
  });
});
