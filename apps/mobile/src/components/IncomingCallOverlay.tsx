import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Vibration,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar } from './Ui';
import { api } from '../lib/api';
import { graphql } from '../lib/graphql';
import { getRealtimeSocket } from '../lib/realtime';
import type { RelayUser } from '../navigation/types';
import { colors } from '../theme/colors';

type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
type ParticipantStatus =
  | 'INVITED'
  | 'RINGING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'MISSED'
  | 'LEFT';

type CallSession = {
  id: string;
  conversationId: string;
  initiatorId: string;
  type: 'AUDIO';
  status: CallStatus;
  createdAt: string;
  updatedAt: string;
  participants: {
    id: string;
    userId: string;
    status: ParticipantStatus;
    invitedAt: string;
    respondedAt?: string | null;
    joinedAt?: string | null;
    leftAt?: string | null;
  }[];
};

type CallEvent = {
  eventType: 'invitation' | 'updated';
  callId: string;
  participantIds: string[];
};

const HISTORY_QUERY = `
  query MobileIncomingCallHistory($input: CallHistoryInput) {
    callHistory(input: $input) {
      id
      conversationId
      initiatorId
      type
      status
      createdAt
      updatedAt
      participants {
        id
        userId
        status
        invitedAt
        respondedAt
        joinedAt
        leftAt
      }
    }
  }
`;

const ACCEPT_CALL = `
  mutation AcceptMobileIncomingCall($input: AcceptCallInput!) {
    acceptCall(input: $input) { id status }
  }
`;

const DECLINE_CALL = `
  mutation DeclineMobileIncomingCall($input: CallActionInput!) {
    declineCall(input: $input) { id status }
  }
`;

export function IncomingCallOverlay({
  user,
  onAccepted,
}: {
  user: RelayUser;
  onAccepted: (callId: string) => void;
}) {
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [contacts, setContacts] = useState<RelayUser[]>([]);
  const [working, setWorking] = useState<'accept' | 'decline' | ''>('');
  const [hiddenCallId, setHiddenCallId] = useState<string | null>(null);

  const loadCalls = useCallback(async () => {
    try {
      const result = await graphql<{ callHistory: CallSession[] }>(
        HISTORY_QUERY,
        { input: { limit: 50 } },
      );
      setCalls(result.callHistory);
    } catch {
      // A transient history failure should not crash the app.
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadCalls());

    const socket = getRealtimeSocket();
    const onCallEvent = (event: CallEvent) => {
      if (!event || !['invitation', 'updated'].includes(event.eventType)) {
        return;
      }
      if (
        !event.participantIds?.some(
          (id) => id.toLowerCase() === user._id.toLowerCase(),
        )
      ) {
        return;
      }

      setHiddenCallId(null);
      void loadCalls();
    };

    socket?.on('callEvent', onCallEvent);
    return () => {
      socket?.off('callEvent', onCallEvent);
    };
  }, [loadCalls, user._id]);

  useEffect(() => {
    let active = true;

    api.get<RelayUser[]>('/messages/users')
      .then((result) => {
        if (active && Array.isArray(result.data)) {
          setContacts(
            result.data.filter(
              (person) => person._id.toLowerCase() !== user._id.toLowerCase(),
            ),
          );
        }
      })
      .catch(() => {
        // Caller identity falls back to a neutral label if contacts are unavailable.
      });

    return () => {
      active = false;
    };
  }, [user._id]);

  const incomingCall = useMemo(
    () =>
      calls.find((call) => {
        if (
          call.id === hiddenCallId ||
          call.status !== 'RINGING' ||
          call.initiatorId.toLowerCase() === user._id.toLowerCase()
        ) {
          return false;
        }

        const ownParticipant = call.participants.find(
          (participant) =>
            participant.userId.toLowerCase() === user._id.toLowerCase(),
        );

        return (
          ownParticipant?.status === 'INVITED' ||
          ownParticipant?.status === 'RINGING'
        );
      }) ?? null,
    [calls, hiddenCallId, user._id],
  );

  const callerName = incomingCall
    ? contacts.find(
        (person) =>
          person._id.toLowerCase() === incomingCall.initiatorId.toLowerCase(),
      )?.fullName ?? 'Unknown caller'
    : 'Unknown caller';

  const incomingCallId = incomingCall?.id;

  useEffect(() => {
    if (!incomingCallId) {
      Vibration.cancel();
      return;
    }

    Vibration.vibrate([0, 900, 500, 900, 700], true);
    return () => Vibration.cancel();
  }, [incomingCallId]);

  const performAction = async (
    action: 'accept' | 'decline',
    recordingConsent = false,
  ) => {
    if (!incomingCall || working) return;

    const callId = incomingCall.id;
    setWorking(action);

    try {
      console.info('[MOBILE][PASS] Responding to incoming call', {
        callId,
        action,
        recordingConsent: action === 'accept' ? recordingConsent : null,
      });

      await graphql<Record<string, { id: string; status: CallStatus }>>(
        action === 'accept' ? ACCEPT_CALL : DECLINE_CALL,
        {
          input: action === 'accept'
            ? { callId, recordingConsent }
            : { callId },
        },
      );

      setHiddenCallId(callId);
      Vibration.cancel();

      if (action === 'accept') {
        onAccepted(callId);
      } else {
        void loadCalls();
      }
    } catch (error) {
      Alert.alert(
        'Call unavailable',
        error instanceof Error ? error.message : 'Could not update the call.',
      );
      void loadCalls();
    } finally {
      setWorking('');
    }
  };

  return (
    <Modal
      visible={Boolean(incomingCall)}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => void performAction('decline')}
    >
      <View style={styles.screen}>
        {incomingCall ? (
          <View style={styles.content}>
            <Text style={styles.eyebrow}>RELAY · INCOMING CALL</Text>
            <View style={styles.avatar}>
              <Avatar name={callerName} size={104} />
            </View>
            <Text style={styles.callerName}>{callerName}</Text>
            <Text style={styles.subtitle}>Audio call · Calling you</Text>

            <View style={styles.actions}>
              <View style={styles.action}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decline incoming call"
                  disabled={Boolean(working)}
                  onPress={() => void performAction('decline')}
                  style={[styles.roundButton, styles.declineButton]}
                >
                  <MaterialCommunityIcons
                    name="phone-hangup"
                    size={30}
                    color="#FFFFFF"
                  />
                </Pressable>
                <Text style={styles.actionLabel}>Decline</Text>
              </View>

              <View style={styles.action}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Accept incoming call"
                  disabled={Boolean(working)}
                  onPress={() => Alert.alert(
                    'Recording and AI summary',
                    'This call can be recorded and transcribed to generate an AI summary. Recording starts only if everyone agrees. Do you consent?',
                    [
                      {
                        text: 'Agree and accept',
                        onPress: () => void performAction('accept', true),
                      },
                      {
                        text: 'Accept without recording',
                        onPress: () => void performAction('accept', false),
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ],
                  )}
                  style={[styles.roundButton, styles.acceptButton]}
                >
                  {working === 'accept' ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <MaterialCommunityIcons
                      name="phone"
                      size={30}
                      color="#FFFFFF"
                    />
                  )}
                </Pressable>
                <Text style={styles.actionLabel}>Accept</Text>
              </View>
            </View>

            <Text style={styles.hint}>
              Keep Relay open while the call connects.
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  avatar: {
    marginTop: 54,
    marginBottom: 24,
  },
  callerName: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 64,
    marginTop: 76,
  },
  action: {
    alignItems: 'center',
    gap: 12,
  },
  roundButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    backgroundColor: colors.danger,
  },
  acceptButton: {
    backgroundColor: '#16A34A',
  },
  actionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 54,
  },
});
