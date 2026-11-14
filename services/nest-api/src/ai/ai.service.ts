/** Service-layer logic for ai service in the Relay NestJS API. */

import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AIStatusResponse {
  service: string;
  provider: string;
  configured: boolean;
}

export interface KnowledgeBaseCitation {
  chunk_id: string;
  document_id: string;
  title: string;
  content: string;
  source_uri: string | null;
  chunk_index: number;
  start: number | null;
  end: number | null;
}

export interface KnowledgeBaseAnswerResponse {
  answer: string;
  citations: KnowledgeBaseCitation[];
}

// Keep the model response typed and limited to the fields the application uses.
export interface ConversationAnalysisResponse {
  summary: string;
  decisions: string[];
  action_items: Array<{
    task: string;
    owner: string | null;
    due_date: string | null;
  }>;
}

// Only send bounded, server-retrieved message content to the internal AI service.
export interface ConversationAnalysisMessage {
  sender: string;
  text: string;
}

@Injectable()
export class AIService {
  constructor(private readonly configService: ConfigService) {}

  async analyzeConversation(
    messages: ConversationAnalysisMessage[],
  ): Promise<ConversationAnalysisResponse> {
    // Enforce limits here as well as in Python, even if a future caller bypasses GraphQL.
    const transcriptSize = messages.reduce(
      (total, message) => total + message.sender.length + message.text.length,
      0,
    );

    if (
      messages.length < 1 ||
      messages.length > 100 ||
      messages.some(
        (message) =>
          !message.sender.trim() ||
          !message.text.trim() ||
          message.sender.length > 200 ||
          message.text.length > 5000,
      ) ||
      transcriptSize > 50000
    ) {
      throw new BadGatewayException(
        'Conversation history is outside the supported analysis limits.',
      );
    }

    const baseUrl = this.configService
      .get<string>('PYTHON_AI_BASE_URL')
      ?.trim();
    const token = this.configService
      .get<string>('PYTHON_AI_INTERNAL_TOKEN')
      ?.trim();

    if (!baseUrl || !token) {
      throw new ServiceUnavailableException(
        'AI service integration is not configured.',
      );
    }

    let response: Response;

    try {
      response = await fetch(new URL('/v1/conversations/analyze', baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ messages }),
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw new ServiceUnavailableException('AI service is unavailable.');
    }

    if (!response.ok) {
      throw new BadGatewayException(
        'AI service could not analyze this conversation.',
      );
    }

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new BadGatewayException(
        'AI service returned an invalid analysis response.',
      );
    }

    // Treat model output as untrusted until every field has the expected shape.
    // Reject unknown fields so the Python response matches the agreed contract.
    if (
      typeof data !== 'object' ||
      data === null ||
      Object.keys(data).some(
        (key) => !['summary', 'decisions', 'action_items'].includes(key),
      ) ||
      !('summary' in data) ||
      typeof data.summary !== 'string' ||
      !data.summary.trim() ||
      data.summary.length > 4000 ||
      !('decisions' in data) ||
      !Array.isArray(data.decisions) ||
      data.decisions.length > 30 ||
      !data.decisions.every(
        (item) => typeof item === 'string' && !!item.trim(),
      ) ||
      !('action_items' in data) ||
      !Array.isArray(data.action_items) ||
      data.action_items.length > 50 ||
      !data.action_items.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          'task' in item &&
          typeof item.task === 'string' &&
          !!item.task.trim() &&
          item.task.length <= 1000 &&
          'owner' in item &&
          (item.owner === null ||
            (typeof item.owner === 'string' && item.owner.length <= 200)) &&
          'due_date' in item &&
          (item.due_date === null ||
            (typeof item.due_date === 'string' && item.due_date.length <= 100)),
      )
    ) {
      throw new BadGatewayException(
        'AI service returned an invalid analysis response.',
      );
    }

    return {
      summary: data.summary.trim(),
      decisions: data.decisions.map((item) => item.trim()),
      action_items: data.action_items.map((item) => ({
        task: item.task.trim(),
        owner: item.owner,
        due_date: item.due_date,
      })),
    };
  }

  async answerQuestion(
    question: string,
    topK: number,
    userId: string,
  ): Promise<KnowledgeBaseAnswerResponse> {
    const normalizedQuestion = question.trim();

    if (
      !normalizedQuestion ||
      normalizedQuestion.length > 2000 ||
      !Number.isInteger(topK) ||
      topK < 1 ||
      topK > 20 ||
      !userId.trim()
    ) {
      throw new BadGatewayException(
        'Knowledge-base question is outside the supported limits.',
      );
    }

    const baseUrl = this.configService
      .get<string>('PYTHON_AI_BASE_URL')
      ?.trim();

    const token = this.configService
      .get<string>('PYTHON_AI_INTERNAL_TOKEN')
      ?.trim();

    if (!baseUrl || !token) {
      throw new ServiceUnavailableException(
        'AI service integration is not configured.',
      );
    }

    let response: Response;

    try {
      response = await fetch(new URL('/v1/documents/answer', baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Relay-User-Id': userId,
        },
        body: JSON.stringify({
          question: normalizedQuestion,
          top_k: topK,
        }),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Knowledge-base AI service is unavailable.',
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        'Knowledge-base AI service could not answer this question.',
      );
    }

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new BadGatewayException(
        'Knowledge-base AI service returned an invalid response.',
      );
    }

    if (
      typeof data !== 'object' ||
      data === null ||
      !('answer' in data) ||
      typeof data.answer !== 'string' ||
      !data.answer.trim() ||
      !('citations' in data) ||
      !Array.isArray(data.citations) ||
      data.citations.length > 20 ||
      !data.citations.every(
        (citation) =>
          typeof citation === 'object' &&
          citation !== null &&
          'chunk_id' in citation &&
          typeof citation.chunk_id === 'string' &&
          'document_id' in citation &&
          typeof citation.document_id === 'string' &&
          'title' in citation &&
          typeof citation.title === 'string' &&
          'content' in citation &&
          typeof citation.content === 'string' &&
          'source_uri' in citation &&
          (citation.source_uri === null ||
            typeof citation.source_uri === 'string') &&
          'chunk_index' in citation &&
          Number.isInteger(citation.chunk_index) &&
          'start' in citation &&
          (citation.start === null ||
            (typeof citation.start === 'number' &&
              Number.isInteger(citation.start))) &&
          'end' in citation &&
          (citation.end === null ||
            (typeof citation.end === 'number' &&
              Number.isInteger(citation.end))),
      )
    ) {
      throw new BadGatewayException(
        'Knowledge-base AI service returned an invalid response.',
      );
    }

    return {
      answer: data.answer.trim(),
      citations: data.citations.map((citation) => ({
        chunk_id: citation.chunk_id,
        document_id: citation.document_id,
        title: citation.title,
        content: citation.content,
        source_uri: citation.source_uri,
        chunk_index: citation.chunk_index,
        start: citation.start,
        end: citation.end,
      })),
    };
  }

  async getStatus(): Promise<AIStatusResponse> {
    const baseUrl = this.configService
      .get<string>('PYTHON_AI_BASE_URL')
      ?.trim();

    const token = this.configService
      .get<string>('PYTHON_AI_INTERNAL_TOKEN')
      ?.trim();

    if (!baseUrl || !token) {
      throw new ServiceUnavailableException(
        'AI service integration is not configured.',
      );
    }

    let response: Response;

    try {
      response = await fetch(new URL('/v1/ai/status', baseUrl), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ServiceUnavailableException('AI service is unavailable.');
    }

    if (!response.ok) {
      throw new BadGatewayException(
        'AI service returned an unsuccessful response.',
      );
    }

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new BadGatewayException('AI service returned an invalid response.');
    }

    if (
      typeof data !== 'object' ||
      data === null ||
      !('service' in data) ||
      typeof data.service !== 'string' ||
      !('provider' in data) ||
      typeof data.provider !== 'string' ||
      !('configured' in data) ||
      typeof data.configured !== 'boolean'
    ) {
      throw new BadGatewayException('AI service returned an invalid response.');
    }

    return {
      service: data.service,
      provider: data.provider,
      configured: data.configured,
    };
  }
}
