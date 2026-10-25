import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, getErrorMessage } from '../lib/api';
import { getRealtimeSocket } from '../lib/realtime';
import { Avatar, Button, ErrorText } from '../components/Ui';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Conversation'>;
type ReplyPreview = {
  _id: string;
  senderId: string;
  receiverId: string;
  text?: string;
  image?: string;
  createdAt: string;
};
type Message = {
  _id: string;
  senderId: string;
  receiverId: string;
  text?: string;
  image?: string;
  createdAt: string;
  readAt?: string | null;
  editedAt?: string | null;
  replyTo?: ReplyPreview | null;
};

export function ConversationScreen({ route }: Props) {
  // Read the peer from the shared, typed navigation contract.
  const { person } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = useRef(false);

  const stopTyping = useCallback(() => {
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
      typingTimeout.current = null;
    }

    if (typingActive.current) {
      getRealtimeSocket()?.emit('typing', {
        recipientId: person._id,
        isTyping: false,
      });
      typingActive.current = false;
    }
  }, [person._id]);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);

    if (!value.trim()) {
      stopTyping();
      return;
    }

    const socket = getRealtimeSocket();
    if (!socket) return;

    if (!typingActive.current) {
      socket.emit('typing', {
        recipientId: person._id,
        isTyping: true,
      });
      typingActive.current = true;
    }

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(stopTyping, 1500);
  }, [person._id, stopTyping]);
  // Tie loading to the selected peer so old messages aren't shown during navigation.
  const [loadedPersonId, setLoadedPersonId] = useState<string | null>(null);
  const loading = loadedPersonId !== person._id;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [historyFailed, setHistoryFailed] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const shouldScrollToEnd = useRef(true);

  const appendUnique = useCallback((message: Message) => {
    shouldScrollToEnd.current = true;
    setMessages((current) => current.some((item) => String(item._id) === String(message._id)) ? current : [...current, message]);
  }, []);

  const markMessagesRead = useCallback(async () => {
    try {
      await api.post(`/messages/read/${person._id}`);
    } catch {
      // Read receipts are best-effort; opening a conversation must still work.
    }
  }, [person._id]);

  useEffect(() => {
    // Cancel history loading if this screen closes or the selected peer changes.
    const controller = new AbortController();

    api.get<Message[]>(`/messages/${person._id}`, {
      params: { limit: 50 },
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        setMessages(Array.isArray(response.data) ? response.data : []);
        void markMessagesRead();
        setHasMore(response.headers['x-has-more'] === 'true');
        setOlderCursor(response.headers['x-next-cursor'] || null);
        shouldScrollToEnd.current = true;
        setError('');
        setHistoryFailed(false);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setHistoryFailed(true);
          setError(getErrorMessage(requestError, 'Unable to load this conversation.'));
        }
      })
      .finally(() => {
        // Only the active request may mark this peer's history as loaded.
        if (!controller.signal.aborted) setLoadedPersonId(person._id);
      });

    return () => controller.abort();
  }, [person._id, historyAttempt, markMessagesRead]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket) {
      return;
    }

    const onUserTyping = (payload: { userId?: string; isTyping?: boolean }) => {
      if (String(payload?.userId) !== String(person._id)) return;
      if (typeof payload.isTyping !== 'boolean') return;
      setPeerTyping(payload.isTyping);
    };

    socket.on('userTyping', onUserTyping);
    return () => {
      socket.off('userTyping', onUserTyping);
      setPeerTyping(false);
    };
  }, [person._id]);

  useEffect(() => {
    return () => stopTyping();
  }, [stopTyping]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket) return;
    const onMessage = (message: Message) => {
      // Keep the screen scoped to this peer and acknowledge incoming messages.
      if (String(message.senderId) === String(person._id) || String(message.receiverId) === String(person._id)) {
        appendUnique(message);
      }
      if (String(message.senderId) === String(person._id)) {
        void markMessagesRead();
      }
    };

    const onMessageUpdated = (message: Message) => {
      if (
        String(message.senderId) !== String(person._id) &&
        String(message.receiverId) !== String(person._id)
      ) {
        return;
      }

      setMessages((current) =>
        current.map((item) =>
          String(item._id) === String(message._id)
            ? { ...item, ...message }
            : item
        )
      );
    };

    const onMessagesRead = (payload: { readerId?: string; messageIds?: string[]; readAt?: string }) => {
      if (String(payload?.readerId) !== String(person._id)) return;
      if (!Array.isArray(payload.messageIds) || typeof payload.readAt !== 'string') return;

      const readIds = new Set(payload.messageIds.map(String));
      setMessages((current) => current.map((message) =>
        readIds.has(String(message._id))
          ? { ...message, readAt: payload.readAt }
          : message
      ));
    };

    socket.on('newMessage', onMessage);
    socket.on('messageUpdated', onMessageUpdated);
    socket.on('messagesRead', onMessagesRead);
    return () => {
      socket.off('newMessage', onMessage);
      socket.off('messageUpdated', onMessageUpdated);
      socket.off('messagesRead', onMessagesRead);
    };
  }, [person._id, appendUnique, markMessagesRead]);

  useEffect(() => {
    if (messages.length && shouldScrollToEnd.current) {
      listRef.current?.scrollToEnd({ animated: true });
      shouldScrollToEnd.current = false;
    }
  }, [messages.length]);

  const loadOlder = async () => {
    if (!hasMore || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    setError('');
    shouldScrollToEnd.current = false;
    try {
      const response = await api.get<Message[]>(`/messages/${person._id}`, {
        params: { limit: 50, before: olderCursor },
      });
      const olderMessages = Array.isArray(response.data) ? response.data : [];
      setMessages((current) => {
        const byId = new Map<string, Message>();
        for (const item of [...olderMessages, ...current]) byId.set(String(item._id), item);
        return [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      });
      setHasMore(response.headers['x-has-more'] === 'true');
      setOlderCursor(response.headers['x-next-cursor'] || null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load earlier messages.'));
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (text.length > 5000) return setError('Messages must be 5,000 characters or fewer.');
    setDraft('');
    stopTyping();
    setError('');
    shouldScrollToEnd.current = true;
    setSending(true);
    Keyboard.dismiss();
    try {
      const { data } = await api.post<Message>(`/messages/send/${person._id}`, {
        text,
        ...(replyTo ? { replyTo: replyTo._id } : {}),
      });
      appendUnique(data);
      setReplyTo(null);
    } catch (requestError) {
      setDraft(text);
      setError(getErrorMessage(requestError, 'Message was not sent. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const startEditing = (message: Message) => {
    setEditingMessageId(message._id);
    setEditDraft(message.text ?? '');
    setError('');
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditDraft('');
    setSavingEdit(false);
  };

  const saveEdit = async () => {
    const text = editDraft.trim();

    if (!editingMessageId || savingEdit) return;
    if (!text) {
      setError('Message text cannot be empty.');
      return;
    }
    if (text.length > 5000) {
      setError('Messages must be 5,000 characters or fewer.');
      return;
    }

    setSavingEdit(true);
    setError('');

    try {
      const { data } = await api.patch<Message>(
        `/messages/${editingMessageId}`,
        { text },
      );

      setMessages((current) =>
        current.map((item) =>
          String(item._id) === String(data._id)
            ? { ...item, ...data }
            : item
        )
      );

      cancelEditing();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Message edit failed. Please try again.'));
    } finally {
      setSavingEdit(false);
    }
  };

  return <Screen>
    <View style={styles.peer}><Avatar name={person.fullName} size={40} /><View style={styles.peerCopy}><Text style={styles.peerName}>{person.fullName}</Text><Text style={styles.peerEmail}>{person.email}</Text></View></View>
    {peerTyping ? <Text style={styles.typing}>Typing…</Text> : null}
    <ErrorText>{error}</ErrorText>
    {loading ? (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.helper}>Loading messages…</Text>
      </View>
    ) : historyFailed ? (
      <View style={styles.loadFailure}>
        <Text style={styles.emptyTitle}>Couldn&apos;t load this conversation</Text>
        <Text style={styles.helper}>Check your connection and try again.</Text>
        <Button onPress={() => {
          setError('');
          setLoadedPersonId(null);
          setHistoryAttempt((attempt) => attempt + 1);
        }}>Try again</Button>
      </View>
    ) : <FlatList style={styles.messages} ref={listRef} data={messages} keyExtractor={(message) => message._id} contentContainerStyle={messages.length ? styles.messageList : styles.emptyList} keyboardShouldPersistTaps="handled" ListHeaderComponent={hasMore ? <Pressable accessibilityRole="button" disabled={loadingOlder} onPress={() => void loadOlder()} style={styles.loadOlder}>{loadingOlder ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.loadOlderText}>Load earlier messages</Text>}</Pressable> : null} renderItem={({ item }) => {
      const outgoing = String(item.senderId) !== String(person._id);
      const quoted = item.replyTo;
      const quoteAuthor = quoted
        ? (String(quoted.senderId) === String(person._id) ? person.fullName : 'You')
        : '';
      const quoteText = quoted?.text?.trim() || (quoted?.image ? 'Photo' : 'Message');

      return (
        <View style={[styles.messageRow, outgoing ? styles.outgoingRow : styles.incomingRow]}>
          <View style={[styles.bubble, outgoing ? styles.outgoingBubble : styles.incomingBubble]}>
            {quoted ? (
              <View style={styles.quotedReply}>
                <Text style={styles.quoteAuthor} numberOfLines={1}>{quoteAuthor}</Text>
                <Text style={styles.quoteText} numberOfLines={2}>{quoteText}</Text>
              </View>
            ) : null}
            {editingMessageId === item._id ? (
              <View style={styles.editContainer}>
                <TextInput
                  accessibilityLabel="Edit message"
                  value={editDraft}
                  onChangeText={setEditDraft}
                  multiline
                  maxLength={5000}
                  editable={!savingEdit}
                  textAlignVertical="top"
                  style={styles.editInput}
                />
                <View style={styles.editActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={savingEdit}
                    onPress={() => void saveEdit()}
                    style={styles.replyAction}
                  >
                    <Text style={styles.replyActionText}>
                      {savingEdit ? 'Saving…' : 'Save'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={savingEdit}
                    onPress={cancelEditing}
                    style={styles.replyAction}
                  >
                    <Text style={styles.editCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                {item.text ? <Text style={styles.messageText}>{item.text}</Text> : null}
                {item.editedAt ? <Text style={styles.editedLabel}>Edited</Text> : null}
              </>
            )}
            <Text style={styles.timestamp}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
            {outgoing && item.readAt ? <Text style={styles.readReceipt}>Read</Text> : null}
            {outgoing && Boolean(item.text?.trim()) && editingMessageId !== item._id ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit message"
                onPress={() => startEditing(item)}
                style={styles.replyAction}
              >
                <Text style={styles.replyActionText}>Edit</Text>
              </Pressable>
            ) : null}
            {editingMessageId !== item._id ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reply to message"
                onPress={() => setReplyTo(item)}
                style={styles.replyAction}
              >
                <Text style={styles.replyActionText}>Reply</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    }} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Say hello</Text><Text style={styles.helper}>This is the beginning of your conversation.</Text></View>} />}
    {replyTo ? (
      <View style={styles.replyComposer}>
        <View style={styles.replyComposerCopy}>
          <Text style={styles.quoteAuthor}>
            Replying to {String(replyTo.senderId) === String(person._id) ? person.fullName : 'yourself'}
          </Text>
          <Text style={styles.quoteText} numberOfLines={2}>
            {replyTo.text?.trim() || (replyTo.image ? 'Photo' : 'Message')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel reply"
          onPress={() => setReplyTo(null)}
          style={styles.replyCancel}
        >
          <Text style={styles.replyActionText}>×</Text>
        </Pressable>
      </View>
    ) : null}
    <View style={styles.composer}><TextInput accessibilityLabel="Message" placeholder="Write a message…" placeholderTextColor={colors.muted} multiline maxLength={5000} value={draft} onChangeText={handleDraftChange} style={styles.input} returnKeyType="default" textAlignVertical="center" /><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!draft.trim() || sending} onPress={() => void send()} style={({ pressed }) => [styles.send, (!draft.trim() || sending || pressed) && styles.sendDim]}><Text style={styles.sendText}>{sending ? '…' : '↑'}</Text></Pressable></View>
  </Screen>;
}

const styles = StyleSheet.create({
  messages: { flex: 1, minHeight: 0 },
  editContainer: { gap: 8, minWidth: 180 },
  editInput: { color: colors.text, fontSize: 14, lineHeight: 20, minHeight: 48, maxHeight: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8 },
  editActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  editCancelText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  editedLabel: { color: colors.muted, fontSize: 9, fontStyle: 'italic', alignSelf: 'flex-end' },
  quotedReply: { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 8, paddingVertical: 3, marginBottom: 4, gap: 3 },
  quoteAuthor: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  quoteText: { color: colors.text, opacity: 0.85, fontSize: 11, lineHeight: 15 },
  replyAction: { alignSelf: 'flex-start', paddingTop: 2, paddingBottom: 1 },
  replyActionText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  replyComposer: { flexDirection: 'row', alignItems: 'center', gap: 10, borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 9, marginTop: 8, borderRadius: 8 },
  replyComposerCopy: { flex: 1, gap: 3 },
  replyCancel: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  peer: { flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 16, marginBottom: 8 }, peerCopy: { flex: 1, gap: 4 }, peerName: { color: colors.text, fontWeight: '800', fontSize: 15 }, peerEmail: { color: colors.muted, fontSize: 11 }, typing: { color: colors.primary, fontSize: 12, paddingVertical: 4 }, messageList: { paddingVertical: 14, gap: 10 }, loadOlder: { alignSelf: 'center', minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, marginBottom: 8 }, loadOlderText: { color: colors.primary, fontSize: 11, fontWeight: '800' }, emptyList: { flexGrow: 1, justifyContent: 'center' }, messageRow: { flexDirection: 'row', width: '100%' }, outgoingRow: { justifyContent: 'flex-end' }, incomingRow: { justifyContent: 'flex-start' }, bubble: { maxWidth: '84%', paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7, borderRadius: 16, gap: 5 }, outgoingBubble: { backgroundColor: colors.outgoing, borderBottomRightRadius: 5 }, incomingBubble: { backgroundColor: colors.incoming, borderBottomLeftRadius: 5 }, messageText: { color: colors.text, fontSize: 14, lineHeight: 20 }, timestamp: { color: '#D4DAEF', opacity: 0.75, fontSize: 9, alignSelf: 'flex-end' }, readReceipt: { color: '#D4DAEF', fontSize: 9, fontWeight: '800', alignSelf: 'flex-end' }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, paddingBottom: 3 }, input: { flex: 1, maxHeight: 120, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 14 }, send: { height: 48, width: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, sendDim: { opacity: 0.55 }, sendText: { color: colors.background, fontWeight: '900', fontSize: 25, marginTop: -3 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, loadFailure: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 }, helper: { color: colors.muted, fontSize: 13, lineHeight: 19 }, empty: { alignItems: 'center', gap: 8 }, emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 18 } });
