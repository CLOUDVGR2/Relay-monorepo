import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, getErrorMessage } from "../lib/api";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Avatar, Button, ErrorText } from "../components/Ui";
import { Screen } from "../components/Screen";
import { graphql } from "../lib/graphql";
import { getRealtimeSocket } from "../lib/realtime";
import type { RelayUser, RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useCallMedia } from "../hooks/useCallMedia";
import {
  completeRecordingUpload,
  refreshRecordingUpload,
  uploadRecordingFile,
} from "../lib/call-recording-api";
import {
  deleteRecordingRecovery,
  listRecordingRecoveries,
  markRecordingUploaded,
} from "../lib/call-recording-recovery";
import type {
  RecordingRecoveryRecord,
} from "../lib/call-recording-recovery";

const HISTORY_PAGE_SIZE = 10;

type Props = NativeStackScreenProps<RootStackParamList, "Calls"> & {
  user: RelayUser;
};

type MediaType = "AUDIO";
type CallStatus = "RINGING" | "ACTIVE" | "ENDED" | "CANCELLED";
type ParticipantStatus =
  | "INVITED"
  | "RINGING"
  | "ACCEPTED"
  | "DECLINED"
  | "MISSED"
  | "LEFT";

type CallParticipant = {
  id: string;
  userId: string;
  status: ParticipantStatus;
  invitedAt: string;
  respondedAt?: string | null;
  joinedAt?: string | null;
  leftAt?: string | null;
};

type CallTranscript = {
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  text?: string | null;
};

type CallSummary = {
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  summary?: string | null;
  keyPoints?: string[] | null;
  actionItems?:
    | {
        task: string;
        owner: string | null;
        due_date: string | null;
      }[]
    | null;
  failureCode?: string | null;
  generatedAt?: string | null;
};

type CallSession = {
  id: string;
  conversationId: string;
  initiatorId: string;
  type: MediaType;
  status: CallStatus;
  startedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  participants: CallParticipant[];
  recording?: {
    status: string;
    tracks: {
      kind: string;
      transcript?: CallTranscript | null;
    }[];
  } | null;
  summary?: CallSummary | null;
};

type RelayConversation = {
  id: string;
  name?: string | null;
  description?: string | null;
  createdAt: string;

  created?: boolean;
  participants: { userId: string }[];
};

type CallEvent = {
  eventType: "invitation" | "updated";
  callId: string;
  conversationId: string;
  initiatorId: string;
  type: MediaType;
  status: CallStatus;
  participantIds: string[];
  createdAt: string;
};

const HISTORY_QUERY = `
  query MobileCallHistory($input: CallHistoryInput) {
    callHistory(input: $input) {
      id
      conversationId
      initiatorId
      type
      status
      startedAt
      answeredAt
      endedAt
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
      recording {
        status
        tracks {
          kind
          transcript {
            status
            text
          }
        }
      }
      summary {
        status
        summary
        keyPoints
        actionItems
        failureCode
        generatedAt
      }
    }
  }
`;

const CONVERSATIONS_QUERY = `
  query MobileCallConversations {
    conversations {
      id
      name
      description
      createdAt
      participants {
        userId
      }
    }
  }
`;

const CREATE_CONVERSATION_MUTATION = `
  mutation CreateMobileConversation($input: CreateConversationInput!) {
    createConversation(input: $input) {
      created
      id
      name
      description
      createdAt
      participants {
        userId
      }
    }
  }
`;

const HIDE_CONVERSATION_MUTATION = `
  mutation HideMobileConversation($input: HideConversationInput!) {
    hideConversation(input: $input)
  }
`;

const CREATE_CALL_MUTATION = `
  mutation CreateMobileCall($input: CreateCallInput!) {
    createCall(input: $input) {
      created
      id
      conversationId
      initiatorId
      type
      status
      startedAt
      answeredAt
      endedAt
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

const CALL_ACTIONS = {
  accept: `
    mutation AcceptMobileCall($input: AcceptCallInput!) {
      acceptCall(input: $input) { id status }
    }
  `,
  decline: `
    mutation DeclineMobileCall($input: CallActionInput!) {
      declineCall(input: $input) { id status }
    }
  `,
  end: `
    mutation EndMobileCall($input: CallActionInput!) {
      endCall(input: $input) { id status }
    }
  `,
};

const DELETE_CALL_HISTORY_MUTATION = `
  mutation DeleteMobileCallHistory($input: CallActionInput!) {
    deleteCallHistory(input: $input)
  }
`;

const GENERATE_CALL_SUMMARY_MUTATION = `
  mutation GenerateMobileCallSummary($input: CallActionInput!) {
    generateCallSummary(input: $input) {
      id
      summary {
        status
        summary
        keyPoints
        actionItems
        failureCode
        generatedAt
      }
    }
  }
`;

const STATUS_LABELS: Record<CallStatus, string> = {
  RINGING: "Ringing",
  ACTIVE: "Active",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
};

const PARTICIPANT_LABELS: Record<ParticipantStatus, string> = {
  INVITED: "Invited",
  RINGING: "Ringing",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  MISSED: "Missed",
  LEFT: "Left",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function CallsScreen({ user, route, navigation }: Props) {
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [conversations, setConversations] = useState<RelayConversation[]>([]);
  const [contacts, setContacts] = useState<RelayUser[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [infoVisible, setInfoVisible] = useState(false);
  const [mediaCallId, setMediaCallId] = useState<string | null>(null);
  const [recordingRecoveries, setRecordingRecoveries] = useState<RecordingRecoveryRecord[]>([]);
  const remoteEndedCallIdsRef = useRef<Set<string>>(new Set());
  const [historyVisible, setHistoryVisible] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);

  const historyPageCount = Math.max(
    1,
    Math.ceil(calls.length / HISTORY_PAGE_SIZE),
  );
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleCalls = calls.slice(
    (currentHistoryPage - 1) * HISTORY_PAGE_SIZE,
    currentHistoryPage * HISTORY_PAGE_SIZE,
  );

  const selectedMediaCallId = route.params?.callId ?? mediaCallId;
  const mediaCall =
    calls.find(
      (item) => item.id === selectedMediaCallId && item.status === "ACTIVE",
    ) ?? null;

  useEffect(() => {
    const requestedCallId = route.params?.callId;
    if (!requestedCallId) return;

    const acceptedCall = calls.find(
      (call) => call.id === requestedCallId && call.status === "ACTIVE",
    );

    if (acceptedCall) {
      navigation.setParams({ callId: undefined });
    }
  }, [calls, navigation, route.params?.callId]);

  const mediaOtherParticipant = mediaCall?.participants.find(
    (participant) =>
      participant.userId.toLowerCase() !== user._id.toLowerCase(),
  );
  const mediaContact = mediaOtherParticipant
    ? contacts.find(
        (contact) =>
          contact._id.toLowerCase() ===
          mediaOtherParticipant.userId.toLowerCase(),
      )
    : undefined;
  const mediaContactName = mediaContact?.fullName ?? "Your contact";

  const mediaSocket = getRealtimeSocket();
  const {
    remoteStream,
    status: mediaStatus,
    muted,
    recordingAuthorized,
    finishRecording,
    recordingState,
    toggleMute,
  } = useCallMedia(
    mediaCall
      ? {
          id: mediaCall.id,
          type: mediaCall.type,
          status: mediaCall.status,
          initiatorId: mediaCall.initiatorId,
        }
      : null,
    user._id,
    mediaSocket,
  );

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [historyResult, conversationResult] = await Promise.all([
        graphql<{ callHistory: CallSession[] }>(HISTORY_QUERY, {
          input: { limit: 50 },
        }),
        graphql<{ conversations: RelayConversation[] }>(CONVERSATIONS_QUERY),
      ]);

      setCalls(historyResult.callHistory);
      setConversations(conversationResult.conversations);
      setSelectedConversationId((current) =>
        current &&
        conversationResult.conversations.some(
          (conversation) => conversation.id === current,
        )
          ? current
          : (conversationResult.conversations[0]?.id ?? ""),
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load calls.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadRecordingRecoveries = useCallback(async () => {
    try {
      const records = await listRecordingRecoveries(user._id);
      setRecordingRecoveries(records);
    } catch (err) {
      console.warn(
        "[Relay recording] Could not load recovery records:",
        err,
      );
    }
  }, [user._id]);

  useEffect(() => {
    // Initial recovery hydration; the async loader updates state after the database read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecordingRecoveries();
  }, [loadRecordingRecoveries]);

  const retryRecordingRecovery = useCallback(
    async (recovery: RecordingRecoveryRecord) => {
      const recording = recovery.recording;

      if (!recording || recovery.status === "CAPTURE_PENDING") {
        return;
      }

      setWorking(`recording-recovery:${recovery.callId}`);
      setError("");
      setNotice("");

      try {
        if (recovery.status === "RECORDED") {
          const intent = await refreshRecordingUpload(recovery.uploadId);
          await uploadRecordingFile(intent.uploadUrl, recording.path);
          await markRecordingUploaded(user._id, recovery.callId);
        }

        await completeRecordingUpload(recovery.uploadId, {
          contentType: "audio/wav",
          sampleRate: recording.sampleRate,
          channels: recording.channels,
          sampleCount: recording.sampleCount,
          durationMs: recording.durationMs,
          byteSize: recording.byteSize,
          sha256: recording.sha256,
        });

        await deleteRecordingRecovery(user._id, recovery.callId);
        await loadRecordingRecoveries();
        await loadData(true);
        setNotice("Your saved call recording was uploaded successfully.");
      } catch (err) {
        setError(
          getErrorMessage(
            err,
            err instanceof Error
              ? err.message
              : "Could not recover the saved call recording.",
          ),
        );
        await loadRecordingRecoveries();
      } finally {
        setWorking("");
      }
    },
    [loadData, loadRecordingRecoveries, user._id],
  );

  const discardIncompleteRecording = useCallback(
    (recovery: RecordingRecoveryRecord) => {
      if (recovery.status !== "CAPTURE_PENDING") return;

      Alert.alert(
        "Discard incomplete recording?",
        "The audio was not finalized and cannot be recovered. This only removes its local recovery entry.",
        [
          { text: "Keep", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              void (async () => {
                setWorking(`recording-discard:${recovery.callId}`);
                setError("");
                setNotice("");

                try {
                  await deleteRecordingRecovery(user._id, recovery.callId);
                  await loadRecordingRecoveries();
                  setNotice("Incomplete recording recovery entry discarded.");
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not discard the incomplete recording.",
                  );
                } finally {
                  setWorking("");
                }
              })();
            },
          },
        ],
      );
    },
    [loadRecordingRecoveries, user._id],
  );

  const loadContacts = useCallback(async () => {
    try {
      const response = await api.get<RelayUser[]>("/messages/users");
      setContacts(
        (Array.isArray(response.data) ? response.data : []).filter(
          (contact) => contact._id.toLowerCase() !== user._id.toLowerCase(),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your contacts.",
      );
    }
  }, [user._id]);

  const toggleContact = (contactId: string) => {
    const normalizedId = contactId.toLowerCase();
    const alreadySelected = selectedContactIds.includes(normalizedId);

    setSelectedContactIds((current) =>
      alreadySelected
        ? current.filter((id) => id !== normalizedId)
        : [...current, normalizedId],
    );

    if (alreadySelected) {
      setSelectedContactId((current) =>
        current.toLowerCase() === normalizedId
          ? (selectedContactIds.find((id) => id !== normalizedId) ?? "")
          : current,
      );
    } else {
      setSelectedContactId(contactId);
    }
  };

  const hideConversation = (conversation: RelayConversation) => {
    const title = conversation.name?.trim() || "this conversation";

    Alert.alert(
      "Remove conversation?",
      `Hide ${title} from your list? Shared messages and other participants' lists will not be deleted.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setWorking(`hide:${conversation.id}`);
              setError("");
              setNotice("");

              try {
                await graphql<{ hideConversation: boolean }>(
                  HIDE_CONVERSATION_MUTATION,
                  { input: { conversationId: conversation.id } },
                );

                setNotice("Conversation removed from your list.");
                await loadData(true);
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not remove the conversation.",
                );
              } finally {
                setWorking("");
              }
            })();
          },
        },
      ],
    );
  };

  const createConversation = async () => {
    if (!selectedContactId || working) return;

    const contact = contacts.find((item) => item._id === selectedContactId);
    if (!contact) {
      setError("Select a valid contact and try again.");
      return;
    }

    const currentUserId = user._id.toLowerCase();
    const contactId = contact._id.toLowerCase();

    const existingConversation = conversations.find((conversation) => {
      if (conversation.name || conversation.description) return false;

      const participantIds = conversation.participants.map((participant) =>
        participant.userId.toLowerCase(),
      );

      return (
        participantIds.length === 2 &&
        participantIds.includes(currentUserId) &&
        participantIds.includes(contactId)
      );
    });

    if (existingConversation) {
      setSelectedConversationId(existingConversation.id);
      setError("");
      setNotice(`Existing conversation with ${contact.fullName} selected.`);
      Alert.alert(
        "Conversation already created",
        `The conversation with ${contact.fullName} already exists. Opening it for calling.`,
      );
      return;
    }

    setWorking("conversation");
    setError("");
    setNotice("");

    try {
      const result = await graphql<{ createConversation: RelayConversation }>(
        CREATE_CONVERSATION_MUTATION,
        { input: { participantIds: [contact._id] } },
      );

      setConversations((current) => [
        result.createConversation,
        ...current.filter((item) => item.id !== result.createConversation.id),
      ]);
      setSelectedConversationId(result.createConversation.id);
      const reused = result.createConversation.created === false;
      const title = reused
        ? "Conversation already created"
        : "Conversation created";
      const message = reused
        ? `The conversation with ${contact.fullName} already exists and is ready for calling.`
        : `The conversation with ${contact.fullName} is ready for calling.`;
      setNotice(message);
      Alert.alert(title, message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create the conversation.",
      );
    } finally {
      setWorking("");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadContacts();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadContacts]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      await loadData();
      if (!active) return;
    };
    void run();

    const socket = getRealtimeSocket();
    const onCallEvent = (event: CallEvent) => {
      if (!event || !["invitation", "updated"].includes(event.eventType))
        return;
      if (
        !event.participantIds?.some(
          (participantId) =>
            participantId.toLowerCase() === user._id.toLowerCase(),
        )
      )
        return;

      if (event.status === "ENDED" && event.callId === mediaCall?.id) {
        remoteEndedCallIdsRef.current.add(event.callId);
      }

      if (event.eventType === "invitation") {
        setNotice(`Incoming ${event.type.toLowerCase()} call invitation.`);
      } else if (event.status === "ENDED") {
        setNotice("The other participant ended the call.");
      } else {
        setNotice("A call session was updated.");
      }

      void (async () => {
        let recordingError = "";

        if (event.status === "ENDED" && event.callId === mediaCall?.id) {
          try {
            await finishRecording();
          } catch (err) {
            recordingError = getErrorMessage(
              err,
              err instanceof Error ? err.message : "Recording upload failed.",
            );
            await loadRecordingRecoveries();
          }
        }

        await loadData(true);

        if (recordingError) {
          setError(
            `The call ended, but its recording could not be uploaded: ${recordingError}`,
          );
        }
      })();
    };

    socket?.on("callEvent", onCallEvent);

    return () => {
      active = false;
      socket?.off("callEvent", onCallEvent);
    };
  }, [
    finishRecording,
    loadData,
    loadRecordingRecoveries,
    mediaCall?.id,
    user._id,
  ]);

  const performAction = async (
    action: "accept" | "decline" | "end",
    call: CallSession,
    recordingConsent = false,
  ) => {
    if (working) return;
    setWorking(call.id);
    setError("");
    setNotice("");

    let recordingError = "";

    try {
      if (action === "end" && mediaCall?.id === call.id) {
        try {
          await finishRecording();
        } catch (err) {
          recordingError = getErrorMessage(
            err,
            err instanceof Error ? err.message : "Recording upload failed.",
          );
          await loadRecordingRecoveries();
        }
      }

      if (action === "end" && remoteEndedCallIdsRef.current.has(call.id)) {
        remoteEndedCallIdsRef.current.delete(call.id);
        setMediaCallId((current) => (current === call.id ? null : current));
        await loadData(true);

        if (recordingError) {
          setError(
            `The call had already ended, but its recording could not be uploaded: ${recordingError}`,
          );
        } else {
          setNotice("The call had already ended.");
        }
        return;
      }

      await graphql<Record<string, { id: string; status: CallStatus }>>(
        CALL_ACTIONS[action],
        {
          input:
            action === "accept"
              ? { callId: call.id, recordingConsent }
              : { callId: call.id },
        },
      );
      setNotice(
        action === "accept"
          ? "Call accepted. Connecting live media…"
          : action === "decline"
            ? "Call invitation declined."
            : "Call session ended.",
      );
      if (action === "end" || action === "decline") {
        setMediaCallId((current) => (current === call.id ? null : current));
      } else if (action === "accept" || call.status === "ACTIVE") {
        setMediaCallId(call.id);
      }
      await loadData(true);

      if (recordingError) {
        setError(
          `The call ended, but its recording could not be uploaded: ${recordingError}`,
        );
      }
    } catch (err) {
      const actionError = getErrorMessage(
        err,
        err instanceof Error ? err.message : "Could not update the call.",
      );
      setError(
        recordingError
          ? `Could not update the call: ${actionError}. Recording upload also failed: ${recordingError}`
          : actionError,
      );
    } finally {
      setWorking("");
    }
  };

  const generateCallSummary = async (call: CallSession) => {
    if (working || call.status !== "ENDED") return;

    setWorking(call.id);
    setError("");
    setNotice("");

    try {
      await graphql(GENERATE_CALL_SUMMARY_MUTATION, {
        input: { callId: call.id },
      });
      setNotice("Call summary generated.");
      await loadData(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not generate the call summary.",
      );
    } finally {
      setWorking("");
    }
  };

  const deleteInvitation = async (call: CallSession) => {
    if (working) return;

    setWorking(call.id);
    setError("");
    setNotice("");

    try {
      const result = await graphql<{ deleteCallHistory: boolean }>(
        DELETE_CALL_HISTORY_MUTATION,
        { input: { callId: call.id } },
      );

      if (!result.deleteCallHistory) {
        throw new Error("Could not delete the invitation from call history.");
      }

      setNotice("Cancelled invitation removed from your Recent calls.");
      await loadData(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete the invitation from call history.",
      );
    } finally {
      setWorking("");
    }
  };

  const confirmDeleteInvitation = (call: CallSession) => {
    Alert.alert(
      "Delete invitation?",
      "Remove this cancelled invitation from your Recent calls? Other participants’ call histories will not be deleted.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteInvitation(call),
        },
      ],
    );
  };

  const startCall = async (recordingConsent?: boolean) => {
    if (!selectedConversationId || working) return;

    const selectedConversation = conversations.find(
      (conversation) => conversation.id === selectedConversationId,
    );
    const participantIds = new Set(
      (selectedConversation?.participants ?? []).map((participant) =>
        participant.userId.toLowerCase(),
      ),
    );
    const inviteeIds = selectedContactIds.filter(
      (id) =>
        id !== user._id.toLowerCase() && participantIds.has(id.toLowerCase()),
    );

    if (inviteeIds.length === 0) {
      setError("Select at least one contact who belongs to this conversation.");
      return;
    }

    if (inviteeIds.length !== 1) {
      setError(
        "Live audio calls currently support one other participant. Select exactly one contact.",
      );
      return;
    }

    if (recordingConsent === undefined) {
      Alert.alert(
        "Recording and AI summary",
        "This call can be recorded and transcribed to generate an AI summary. Recording starts only if everyone agrees. Do you consent?",
        [
          {
            text: "Agree and call",
            onPress: () => void startCall(true),
          },
          {
            text: "Call without recording",
            onPress: () => void startCall(false),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }

    setWorking("create");
    setError("");
    setNotice("");

    try {
      console.info('[MOBILE][PASS] Creating call with recording consent', {
        recordingConsent,
      });

      const result = await graphql<{
        createCall: CallSession & { created?: boolean };
      }>(CREATE_CALL_MUTATION, {
        input: {
          conversationId: selectedConversationId,
          type: "AUDIO",
          participantIds: inviteeIds,
          recordingConsent,
        },
      });
      const mediaLabel = "Audio";
      const reused = result.createCall.created === false;
      const title = reused
        ? `${mediaLabel} call invitation already created`
        : `${mediaLabel} call invitation created`;
      const message = reused
        ? `An open ${mediaLabel.toLowerCase()} call already exists for this conversation. The existing invitation was reused.`
        : `${mediaLabel} call invitation created.`;
      setNotice(message);
      Alert.alert(title, message);
      await loadData(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start the call.",
      );
    } finally {
      setWorking("");
    }
  };

  return (
    <Screen scroll>
      <View style={styles.pageHeader}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>RELAY · COMMUNICATIONS</Text>
          <Text style={styles.pageTitle}>Calls</Text>
          <Text style={styles.pageSubtitle}>
            Reach your people, wherever the conversation starts.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Call screen information"
          accessibilityHint="Explains invitations and available call features"
          onPress={() => setInfoVisible(true)}
          style={styles.infoButton}
        >
          <Text style={styles.infoButtonText}>i</Text>
        </Pressable>
      </View>

      <ErrorText>{error}</ErrorText>
      {mediaCall ? (
        <Modal
          visible
          animationType="fade"
          presentationStyle="fullScreen"
          statusBarTranslucent
          onRequestClose={() => void performAction("end", mediaCall)}
        >
          <View style={styles.callScreen}>
            <View style={[styles.mediaPanel, styles.fullscreenMediaPanel]}>
              <View style={styles.mediaIdentity}>
                <Avatar name={mediaContactName} size={48} />
                <View style={styles.mediaIdentityCopy}>
                  <Text style={styles.sectionTitle}>{mediaContactName}</Text>
                  <Text accessibilityLiveRegion="polite" style={styles.helper}>
                    {mediaStatus === "connected"
                      ? "Connected"
                      : mediaStatus === "failed"
                        ? "Connection failed — check permissions or network"
                        : `Connecting · Audio call`}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="phone"
                  size={24}
                  color={colors.primary}
                />
              </View>

              <View style={styles.audioStage}>
                <MaterialCommunityIcons
                  name="phone-in-talk"
                  size={42}
                  color={colors.primary}
                />
                <Text style={styles.helper}>
                  {remoteStream
                    ? "Remote audio stream received"
                    : "Waiting for remote audio"}
                </Text>
              </View>

              <Text
                accessibilityLiveRegion="polite"
                style={styles.mediaDisclaimer}
              >
                {recordingState === "recording"
                  ? "Recording your microphone audio."
                  : recordingState === "starting"
                    ? "Starting secure audio recording…"
                    : recordingState === "uploading"
                      ? "Uploading and confirming your recording…"
                      : recordingState === "ready"
                        ? "Your recording was uploaded successfully."
                        : recordingState === "failed"
                          ? "Recording needs attention. End the call again to retry the upload."
                          : recordingAuthorized
                            ? "Both participants consented. Waiting for a stable audio connection."
                            : mediaStatus === "connected"
                              ? "Recording is unavailable until both participants consent."
                              : "Recording authorization has not been confirmed."}
              </Text>

              <View style={styles.actionRow}>
                <View style={styles.actionButton}>
                  <Button secondary onPress={toggleMute}>
                    {muted ? "Unmute" : "Mute"}
                  </Button>
                </View>
                <View style={styles.actionButton}>
                  <Button
                    onPress={() => void performAction("end", mediaCall)}
                    disabled={Boolean(working)}
                  >
                    End call
                  </Button>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {notice ? (
        <View style={styles.noticeCard}>
          <View style={styles.noticeDot} />
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {notice}
          </Text>
        </View>
      ) : null}

      <View style={styles.panel}>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionEyebrow}>GET CONNECTED</Text>
            <Text style={styles.sectionTitle}>Start a call</Text>
          </View>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>01</Text>
          </View>
        </View>
        <Text style={styles.helper}>
          Select a contact to create a conversation, or choose an existing one.
        </Text>

        <Text style={styles.fieldLabel}>YOUR CONTACTS</Text>
        <Text style={styles.helper}>
          Tap contacts to check or uncheck them. Calls only invite selected
          contacts who belong to the conversation below.
        </Text>
        {contacts.length ? (
          <FlatList
            horizontal
            data={contacts}
            keyExtractor={(item) => item._id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.contactList}
            renderItem={({ item }) => {
              const selected = selectedContactIds.includes(
                item._id.toLowerCase(),
              );
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => toggleContact(item._id)}
                  style={[
                    styles.contactChoice,
                    selected && styles.contactChoiceSelected,
                  ]}
                >
                  <View style={styles.contactAvatarWrap}>
                    <Avatar name={item.fullName} size={48} />
                    {selected ? (
                      <View style={styles.selectedMark}>
                        <Text style={styles.selectedMarkText}>✓</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.contactName} numberOfLines={2}>
                    {item.fullName}
                  </Text>
                  <Text style={styles.contactState} numberOfLines={1}>
                    {selected ? "Selected · Invite" : item.email}
                  </Text>
                </Pressable>
              );
            }}
          />
        ) : (
          <View style={styles.inlineEmpty}>
            <Text style={styles.inlineEmptyTitle}>No contacts available</Text>
            <Text style={styles.helper}>
              Add another Relay user to start a new conversation.
            </Text>
          </View>
        )}

        <View style={styles.secondaryAction}>
          <Button
            secondary
            onPress={() => void createConversation()}
            loading={working === "conversation"}
            disabled={!selectedContactId || Boolean(working)}
          >
            + Create conversation
          </Button>
        </View>

        <View style={styles.divider} />

        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.fieldLabel}>YOUR CONVERSATIONS</Text>
            <Text style={styles.sectionTitle}>Who’s joining?</Text>
          </View>
          <Text style={styles.countText}>{conversations.length}</Text>
        </View>

        {conversations.length ? (
          <FlatList
            horizontal
            data={conversations}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.conversationList}
            renderItem={({ item }) => {
              const selected = selectedConversationId === item.id;
              return (
                <View style={styles.conversationCardWrap}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${item.name?.trim() || "conversation"}`}
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedConversationId(item.id)}
                    style={[
                      styles.conversationChoice,
                      selected && styles.conversationChoiceSelected,
                    ]}
                  >
                    <View style={styles.conversationIcon}>
                      <MaterialCommunityIcons
                        name="message-text-outline"
                        size={19}
                        color={colors.primary}
                      />
                    </View>
                    <Text style={styles.choiceTitle} numberOfLines={2}>
                      {item.name?.trim() || "Conversation"}
                    </Text>
                    <View style={styles.conversationBottom}>
                      <Text style={styles.choiceSubtitle} numberOfLines={1}>
                        {selected ? "Ready to call" : "Tap to select"}
                      </Text>
                      <View
                        style={[
                          styles.selectionCircle,
                          selected && styles.selectionCircleSelected,
                        ]}
                      >
                        {selected ? (
                          <Text style={styles.selectionCheck}>✓</Text>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name?.trim() || "conversation"} from your list`}
                    accessibilityHint="Hides this conversation only from your list."
                    disabled={Boolean(working)}
                    onPress={() => hideConversation(item)}
                    style={styles.hideConversationButton}
                    hitSlop={8}
                  >
                    {working === `hide:${item.id}` ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <MaterialCommunityIcons
                        name="close-circle-outline"
                        size={21}
                        color={colors.danger}
                      />
                    )}
                  </Pressable>
                </View>
              );
            }}
          />
        ) : (
          <View style={styles.inlineEmpty}>
            <Text style={styles.inlineEmptyTitle}>Nothing here yet</Text>
            <Text style={styles.helper}>
              Create a conversation with a contact to get started.
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.fieldLabel}>CALL TYPE</Text>
        <Text style={styles.helper}>Audio call · Voice only</Text>

        <Text style={styles.helper}>
          {(() => {
            const conversation = conversations.find(
              (item) => item.id === selectedConversationId,
            );
            const memberIds = new Set(
              (conversation?.participants ?? []).map((participant) =>
                participant.userId.toLowerCase(),
              ),
            );
            const count = selectedContactIds.filter(
              (id) =>
                id !== user._id.toLowerCase() &&
                memberIds.has(id.toLowerCase()),
            ).length;

            return count === 1
              ? "1 selected contact can be invited."
              : `${count} selected contacts can be invited.`;
          })()}
        </Text>
        <View style={styles.invitationButton}>
          <Button
            onPress={() => void startCall()}
            loading={working === "create"}
            disabled={
              !selectedConversationId ||
              Boolean(working) ||
              !selectedContactIds.some((id) => {
                const conversation = conversations.find(
                  (item) => item.id === selectedConversationId,
                );
                return (
                  id !== user._id.toLowerCase() &&
                  (conversation?.participants ?? []).some(
                    (participant) =>
                      participant.userId.toLowerCase() === id.toLowerCase(),
                  )
                );
              })
            }
          >
            Create audio invitation
          </Button>
        </View>
        <Text style={styles.mediaDisclaimer}>
          Live media supports one-to-one audio calls.
        </Text>
      </View>

      {recordingRecoveries.length > 0 ? (
        <View style={{ gap: 12, marginBottom: 20 }}>
          <Text style={styles.sectionTitle}>Recording recovery</Text>
          {recordingRecoveries.map((recovery) => {
            const isRetrying =
              working === `recording-recovery:${recovery.callId}`;

            return (
              <View key={recovery.callId} style={styles.callCard}>
                <Text style={styles.callTitle}>Saved call recording</Text>
                <Text style={styles.summaryMuted}>
                  {recovery.status === "CAPTURE_PENDING"
                    ? "Recording was interrupted before the WAV file was finalized. This incomplete capture cannot be uploaded."
                    : recovery.status === "UPLOADED"
                      ? "The audio file was uploaded. Retry confirmation to finish saving it."
                      : "A finalized audio file is saved on this device and needs to be uploaded."}
                </Text>
                {recovery.status !== "CAPTURE_PENDING" &&
                recovery.recording ? (
                  <Button
                    onPress={() => void retryRecordingRecovery(recovery)}
                    loading={isRetrying}
                    disabled={Boolean(working)}
                  >
                    Retry recording upload
                  </Button>
                ) : recovery.status === "CAPTURE_PENDING" ? (
                  <Button
                    secondary
                    onPress={() => discardIncompleteRecording(recovery)}
                    loading={working === `recording-discard:${recovery.callId}`}
                    disabled={Boolean(working)}
                  >
                    Discard incomplete recording
                  </Button>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.historyHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            historyVisible ? "Hide recent calls" : "Show recent calls"
          }
          onPress={() => setHistoryVisible((visible) => !visible)}
          style={styles.historyToggle}
        >
          <Text style={styles.sectionTitle}>Recent calls</Text>
          <MaterialCommunityIcons
            name={historyVisible ? "chevron-up" : "chevron-down"}
            size={22}
            color={colors.primary}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void loadData(true)}
          disabled={refreshing || Boolean(working)}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {historyVisible ? (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.helper}>Loading call history…</Text>
          </View>
        ) : calls.length ? (
          <View style={styles.historyList}>
            {visibleCalls.map((item) => {
              const ownParticipant = item.participants.find(
                (participant) =>
                  participant.userId.toLowerCase() === user._id.toLowerCase(),
              );
              const incoming =
                item.initiatorId.toLowerCase() !== user._id.toLowerCase();
              const canAnswer =
                incoming &&
                (item.status === "RINGING" || item.status === "ACTIVE") &&
                (ownParticipant?.status === "INVITED" ||
                  ownParticipant?.status === "RINGING");
              const canEnd =
                item.status === "RINGING" || item.status === "ACTIVE";
              const canDeleteInvitation =
                item.status === "CANCELLED" &&
                item.initiatorId.toLowerCase() === user._id.toLowerCase();
              const others = item.participants.filter(
                (participant) =>
                  participant.userId.toLowerCase() !== user._id.toLowerCase(),
              );

              return (
                <View key={item.id} style={styles.callCard}>
                  <View style={styles.callTop}>
                    <View style={styles.callIcon}>
                      <MaterialCommunityIcons
                        name="phone-outline"
                        size={22}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.callDetails}>
                      <Text style={styles.callTitle}>
                        Audio call
                        {incoming ? " · Incoming" : " · Outgoing"}
                      </Text>
                      <Text style={styles.callMeta}>
                        {formatDate(item.createdAt)}
                      </Text>
                      <Text style={styles.callMeta}>
                        {STATUS_LABELS[item.status]}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        item.status === "ACTIVE" && styles.activeBadge,
                        item.status === "RINGING" && styles.ringingBadge,
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>{item.status}</Text>
                    </View>
                  </View>

                  <Text style={styles.participants}>
                    {others.length} other participant
                    {others.length === 1 ? "" : "s"}
                    {ownParticipant
                      ? ` · You: ${PARTICIPANT_LABELS[ownParticipant.status]}`
                      : ""}
                  </Text>

                  {item.status === "ENDED"
                    ? (() => {
                        const summary = item.summary;
                        const hasTranscript =
                          item.recording?.status === "READY" &&
                          item.recording.tracks.some(
                            (track) =>
                              track.transcript?.status === "COMPLETED" &&
                              Boolean(track.transcript.text?.trim()),
                          );

                        return (
                          <View style={styles.summarySection}>
                            <Text style={styles.summaryTitle}>
                              Call summary
                            </Text>

                            {summary?.status === "COMPLETED" &&
                            summary.summary ? (
                              <>
                                <Text style={styles.summaryBody}>
                                  {summary.summary}
                                </Text>
                                {Array.isArray(summary.keyPoints) &&
                                summary.keyPoints.length > 0 ? (
                                  <>
                                    <Text style={styles.summarySubheading}>
                                      Key points
                                    </Text>
                                    {summary.keyPoints.map((point, index) => (
                                      <Text
                                        key={`${item.id}-point-${index}`}
                                        style={styles.summaryListText}
                                      >
                                        • {point}
                                      </Text>
                                    ))}
                                  </>
                                ) : null}
                                {Array.isArray(summary.actionItems) &&
                                summary.actionItems.length > 0 ? (
                                  <>
                                    <Text style={styles.summarySubheading}>
                                      Action items
                                    </Text>
                                    {summary.actionItems.map(
                                      (action, index) => (
                                        <Text
                                          key={`${item.id}-action-${index}`}
                                          style={styles.summaryListText}
                                        >
                                          • {action.task}
                                          {action.owner
                                            ? ` · ${action.owner}`
                                            : ""}
                                          {action.due_date
                                            ? ` · Due ${action.due_date}`
                                            : ""}
                                        </Text>
                                      ),
                                    )}
                                  </>
                                ) : null}
                              </>
                            ) : summary?.status === "PROCESSING" ||
                              summary?.status === "QUEUED" ? (
                              <Text style={styles.summaryMuted}>
                                Summary is being generated…
                              </Text>
                            ) : hasTranscript ? (
                              <>
                                <Text style={styles.summaryMuted}>
                                  {summary?.status === "FAILED"
                                    ? "The previous summary attempt failed. You can retry."
                                    : "Generate a summary from this call’s transcript."}
                                </Text>
                                <Button
                                  secondary
                                  onPress={() => void generateCallSummary(item)}
                                  loading={working === item.id}
                                  disabled={Boolean(working)}
                                >
                                  {summary?.status === "FAILED"
                                    ? "Retry summary"
                                    : "Generate summary"}
                                </Button>
                              </>
                            ) : (
                              <Text style={styles.summaryMuted}>
                                A completed transcript is required before this
                                call can be summarized.
                              </Text>
                            )}
                          </View>
                        );
                      })()
                    : null}

                  {canAnswer ? (
                    <View style={styles.actionRow}>
                      <View style={styles.actionButton}>
                        <Button
                          onPress={() =>
                            Alert.alert(
                              "Recording and AI summary",
                              "This call can be recorded and transcribed to generate an AI summary. Recording starts only if everyone agrees. Do you consent?",
                              [
                                {
                                  text: "Agree and accept",
                                  onPress: () =>
                                    void performAction("accept", item, true),
                                },
                                {
                                  text: "Accept without recording",
                                  onPress: () =>
                                    void performAction("accept", item, false),
                                },
                                { text: "Cancel", style: "cancel" },
                              ],
                            )
                          }
                          loading={working === item.id}
                          disabled={Boolean(working)}
                        >
                          Accept
                        </Button>
                      </View>
                      <View style={styles.actionButton}>
                        <Button
                          secondary
                          onPress={() => void performAction("decline", item)}
                          disabled={Boolean(working)}
                        >
                          Decline
                        </Button>
                      </View>
                    </View>
                  ) : null}

                  {item.status === "ACTIVE" && mediaCallId !== item.id ? (
                    <Button
                      onPress={() => setMediaCallId(item.id)}
                      disabled={Boolean(working)}
                    >
                      Join live call
                    </Button>
                  ) : null}

                  {canEnd ? (
                    <Button
                      secondary
                      onPress={() => void performAction("end", item)}
                      disabled={Boolean(working)}
                    >
                      {item.status === "RINGING"
                        ? "Cancel invitation"
                        : "End session"}
                    </Button>
                  ) : null}

                  {canDeleteInvitation ? (
                    <Button
                      secondary
                      onPress={() => confirmDeleteInvitation(item)}
                      disabled={Boolean(working)}
                    >
                      Delete invitation
                    </Button>
                  ) : null}
                </View>
              );
            })}
            {historyPageCount > 1 ? (
              <View style={styles.historyPagination}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous call history page"
                  disabled={currentHistoryPage === 1}
                  onPress={() =>
                    setHistoryPage((page) =>
                      Math.max(1, Math.min(historyPageCount, page) - 1),
                    )
                  }
                  style={[
                    styles.pageArrow,
                    currentHistoryPage === 1 && styles.pageArrowDisabled,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="chevron-left"
                    size={22}
                    color={historyPage === 1 ? colors.muted : colors.primary}
                  />
                </Pressable>
                <Text style={styles.pageIndicator}>
                  Page {currentHistoryPage} of {historyPageCount}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next call history page"
                  disabled={currentHistoryPage === historyPageCount}
                  onPress={() =>
                    setHistoryPage((page) =>
                      Math.min(
                        historyPageCount,
                        Math.min(historyPageCount, page) + 1,
                      ),
                    )
                  }
                  style={[
                    styles.pageArrow,
                    currentHistoryPage === historyPageCount &&
                      styles.pageArrowDisabled,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={
                      historyPage === historyPageCount
                        ? colors.muted
                        : colors.primary
                    }
                  />
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyList}>
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No calls yet</Text>
              <Text style={styles.helper}>
                Calls you create or receive will appear here.
              </Text>
            </View>
          </View>
        )
      ) : null}

      <Modal
        visible={infoVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setInfoVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close information"
            style={StyleSheet.absoluteFill}
            onPress={() => setInfoVisible(false)}
          />
          <View style={styles.infoSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.sectionEyebrow}>CALLING ON RELAY</Text>
                <Text style={styles.modalTitle}>A quick guide</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setInfoVisible(false)}
                style={styles.modalClose}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.infoScroll}
              contentContainerStyle={styles.infoScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.infoRow}>
                <View style={styles.infoIconBox}>
                  <Text style={styles.infoRowIcon}>01</Text>
                </View>
                <View style={styles.infoRowCopy}>
                  <Text style={styles.infoRowTitle}>Choose who to call</Text>
                  <Text style={styles.infoRowText}>
                    Select a contact to create a conversation, or pick one you
                    already have.
                  </Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoIconBox}>
                  <Text style={styles.infoRowIcon}>02</Text>
                </View>
                <View style={styles.infoRowCopy}>
                  <Text style={styles.infoRowTitle}>Send an invitation</Text>
                  <Text style={styles.infoRowText}>
                    Participants in the selected conversation will be invited to
                    the audio call.
                  </Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoIconBox}>
                  <Text style={styles.infoRowIcon}>03</Text>
                </View>
                <View style={styles.infoRowCopy}>
                  <Text style={styles.infoRowTitle}>Manage calls below</Text>
                  <Text style={styles.infoRowText}>
                    Accept or decline incoming invitations, end active sessions,
                    and refresh your recent call history.
                  </Text>
                </View>
              </View>

              <View style={styles.modalNotice}>
                <Text style={styles.modalNoticeTitle}>Good to know</Text>
                <Text style={styles.infoRowText}>
                  Call invitations and session management are available. Live
                  audio media is not configured yet.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalDone}>
              <Button onPress={() => setInfoVisible(false)}>Got it</Button>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 20,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: 7,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  pageSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    maxWidth: 300,
  },
  infoButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  infoButtonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  noticeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginTop: 5,
  },
  notice: { color: colors.success, flex: 1, fontSize: 12, lineHeight: 18 },
  panel: {
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 22,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionHeadingCopy: { flex: 1, minWidth: 0 },
  sectionEyebrow: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  stepBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  fieldLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
    marginTop: 20,
    marginBottom: 2,
  },
  contactList: { gap: 10, paddingVertical: 12, paddingRight: 4 },
  contactChoice: {
    width: 104,
    minHeight: 126,
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  contactChoiceSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
  },
  contactAvatarWrap: { position: "relative", marginBottom: 8 },
  selectedMark: {
    position: "absolute",
    right: -3,
    bottom: -2,
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedMarkText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: "900",
  },
  contactName: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  contactState: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 4,
    textAlign: "center",
    maxWidth: "100%",
  },
  secondaryAction: { marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginTop: 19 },
  countText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  conversationList: { gap: 9, paddingVertical: 12, paddingRight: 4 },
  conversationChoice: {
    width: 166,
    minHeight: 118,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
    justifyContent: "space-between",
  },
  conversationChoiceSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
  },
  conversationIcon: {
    width: 31,
    height: 31,
    borderRadius: 11,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  conversationIconText: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: "800",
  },
  choiceTitle: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  conversationBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    marginTop: 10,
  },
  choiceSubtitle: { color: colors.muted, fontSize: 10, flex: 1 },
  selectionCircle: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectionCheck: { color: colors.background, fontSize: 10, fontWeight: "900" },
  inlineEmpty: {
    padding: 14,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  inlineEmptyTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
  typeRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  typeButton: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  typeButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.outgoing,
  },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  typeIconWrapSelected: { backgroundColor: "rgba(255,255,255,0.12)" },
  typeIcon: { color: colors.muted, fontSize: 19, fontWeight: "800" },
  typeIconSelected: { color: colors.text },
  typeButtonText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  typeButtonTextSelected: { color: colors.text },
  typeDescription: { color: colors.muted, fontSize: 10, marginTop: 4 },
  typeRadio: {
    alignSelf: "flex-end",
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 9,
  },
  typeRadioSelected: { borderColor: colors.text },
  typeRadioInner: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.text,
  },
  invitationButton: { marginTop: 18 },
  callScreen: {
    flex: 1,
    backgroundColor: "#080B12",
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  incomingCallContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  incomingEyebrow: {
    color: "#AAB4C8",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 34,
  },
  incomingAvatar: {
    marginBottom: 22,
    padding: 8,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  incomingCallerName: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  incomingCallSubtitle: {
    color: "#AAB4C8",
    fontSize: 14,
    marginTop: 9,
  },
  incomingCallActions: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginTop: 76,
  },
  incomingAction: {
    alignItems: "center",
    gap: 12,
  },
  incomingRoundButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  declineCallButton: {
    backgroundColor: "#D94B55",
  },
  acceptCallButton: {
    backgroundColor: "#20A66A",
  },
  incomingActionLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  incomingCallHint: {
    color: "#AAB4C8",
    fontSize: 12,
    marginTop: 38,
    textAlign: "center",
  },
  fullscreenMediaPanel: {
    flex: 1,
    marginBottom: 0,
    padding: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 16,
  },
  mediaPanel: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  mediaIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  mediaIdentityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  audioStage: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  mediaDisclaimer: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 10,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  historyToggle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  refreshText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  historyList: { paddingBottom: 12, gap: 10 },
  historyPagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    paddingTop: 8,
  },
  pageArrow: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  pageArrowDisabled: { opacity: 0.45 },
  pageIndicator: {
    minWidth: 88,
    textAlign: "center",
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  center: { alignItems: "center", justifyContent: "center", padding: 28 },
  emptyList: { flexGrow: 1, justifyContent: "center", paddingBottom: 20 },
  empty: {
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  callCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  callTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  callIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  callIconText: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  callDetails: { flex: 1, minWidth: 0, gap: 3 },
  callTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  callMeta: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
  },
  activeBadge: { backgroundColor: "rgba(79,209,165,0.16)" },
  ringingBadge: { backgroundColor: "rgba(124,140,255,0.18)" },
  statusBadgeText: { color: colors.text, fontSize: 9, fontWeight: "900" },
  participants: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 13,
  },
  summarySection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  summaryTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  summarySubheading: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5,
  },
  summaryBody: { color: colors.text, fontSize: 12, lineHeight: 18 },
  summaryListText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  summaryMuted: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  actionRow: { flexDirection: "row", gap: 9, marginTop: 12 },
  actionButton: { flex: 1, minWidth: 0 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: "rgba(3,7,18,0.76)",
  },
  infoSheet: {
    width: "100%",
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 12,
    maxHeight: "88%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 22,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 20,
  },
  modalHeaderCopy: { flex: 1, minWidth: 0 },
  modalTitle: { color: colors.text, fontSize: 24, fontWeight: "900" },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: { color: colors.text, fontSize: 24, lineHeight: 28 },
  infoRow: { flexDirection: "row", gap: 12, marginBottom: 18 },
  infoIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  infoRowIcon: { color: colors.primary, fontSize: 10, fontWeight: "900" },
  infoRowCopy: { flex: 1, minWidth: 0, gap: 4 },
  infoRowTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  infoRowText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  modalNotice: {
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 5,
    marginBottom: 16,
  },
  modalNoticeTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
  modalDone: {
    marginTop: 8,
    paddingBottom: 8,
  },
  infoScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  infoScrollContent: {
    paddingBottom: 4,
  },
  conversationCardWrap: {
    position: "relative",
  },
  hideConversationButton: {
    position: "absolute",
    top: 7,
    right: 7,
    zIndex: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
