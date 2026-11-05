import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CallEventPayload {
  eventType: 'invitation' | 'updated';
  callId: string;
  conversationId: string;
  initiatorId: string;
  type: 'AUDIO';
  status: 'RINGING' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  participantIds: string[];
  createdAt: string;
}

@Injectable()
export class CallEventsPublisher {
  private readonly logger = new Logger(CallEventsPublisher.name);

  constructor(private readonly config: ConfigService) {}

  async publish(event: CallEventPayload): Promise<void> {
    const baseUrl = this.config.get<string>('CALL_EVENTS_BASE_URL');
    const token = this.config.get<string>('CALL_EVENTS_INTERNAL_TOKEN');

    // Publishing is disabled unless both integration settings exist.
    if (!baseUrl || !token) {
      return;
    }

    try {
      const response = await fetch(
        new URL('/internal/call-events', baseUrl),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(3000),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Call event delivery returned HTTP ${response.status} for call ${event.callId}`,
        );
      }
    } catch {
      // Call state is persisted independently; notification failure must not
      // turn a successful database mutation into an apparent API failure.
      this.logger.warn(
        `Call event delivery failed for call ${event.callId}`,
      );
    }
  }
}
