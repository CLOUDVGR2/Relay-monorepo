import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, getErrorMessage } from '../lib/api';
import { getRealtimeSocket } from '../lib/realtime';
import { Avatar, ErrorText } from '../components/Ui';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';

type Person = { _id: string; fullName: string; email: string };
type Message = { _id: string; senderId: string; receiverId: string; text?: string; image?: string; createdAt: string };

export function ConversationScreen({ route }: { route: { params: { person: Person } } }) {
  const { person } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<Message>>(null);
  const shouldScrollToEnd = useRef(true);

  const appendUnique = useCallback((message: Message) => {
    shouldScrollToEnd.current = true;
    setMessages((current) => current.some((item) => String(item._id) === String(message._id)) ? current : [...current, message]);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get<Message[]>(`/messages/${person._id}`, { params: { limit: 50 } })
      .then((response) => {
        if (!active) return;
        setMessages(Array.isArray(response.data) ? response.data : []);
        setHasMore(response.headers['x-has-more'] === 'true');
        setOlderCursor(response.headers['x-next-cursor'] || null);
        shouldScrollToEnd.current = true;
      })
      .catch((requestError: unknown) => { if (active) setError(getErrorMessage(requestError, 'Unable to load this conversation.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [person._id]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket) return;
    const onMessage = (message: Message) => {
      // The API broadcasts incoming messages; keep this screen scoped to its peer.
      if (String(message.senderId) === String(person._id) || String(message.receiverId) === String(person._id)) appendUnique(message);
    };
    socket.on('newMessage', onMessage);
    return () => { socket.off('newMessage', onMessage); };
  }, [person._id, appendUnique]);

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
    setError('');
    shouldScrollToEnd.current = true;
    setSending(true);
    Keyboard.dismiss();
    try {
      const { data } = await api.post<Message>(`/messages/send/${person._id}`, { text });
      appendUnique(data);
    } catch (requestError) {
      setDraft(text);
      setError(getErrorMessage(requestError, 'Message was not sent. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  return <Screen>
    <View style={styles.peer}><Avatar name={person.fullName} size={40} /><View style={styles.peerCopy}><Text style={styles.peerName}>{person.fullName}</Text><Text style={styles.peerEmail}>{person.email}</Text></View></View>
    <ErrorText>{error}</ErrorText>
    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.helper}>Loading messages…</Text></View> : <FlatList ref={listRef} data={messages} keyExtractor={(message) => message._id} contentContainerStyle={messages.length ? styles.messageList : styles.emptyList} keyboardShouldPersistTaps="handled" ListHeaderComponent={hasMore ? <Pressable accessibilityRole="button" disabled={loadingOlder} onPress={() => void loadOlder()} style={styles.loadOlder}>{loadingOlder ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.loadOlderText}>Load earlier messages</Text>}</Pressable> : null} renderItem={({ item }) => {
      const outgoing = String(item.senderId) !== String(person._id);
      return <View style={[styles.messageRow, outgoing ? styles.outgoingRow : styles.incomingRow]}><View style={[styles.bubble, outgoing ? styles.outgoingBubble : styles.incomingBubble]}>{item.text ? <Text style={styles.messageText}>{item.text}</Text> : null}<Text style={styles.timestamp}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text></View></View>;
    }} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Say hello</Text><Text style={styles.helper}>This is the beginning of your conversation.</Text></View>} />}
    <View style={styles.composer}><TextInput accessibilityLabel="Message" placeholder="Write a message…" placeholderTextColor={colors.muted} multiline maxLength={5000} value={draft} onChangeText={setDraft} style={styles.input} returnKeyType="default" textAlignVertical="center" /><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!draft.trim() || sending} onPress={() => void send()} style={({ pressed }) => [styles.send, (!draft.trim() || sending || pressed) && styles.sendDim]}><Text style={styles.sendText}>{sending ? '…' : '↑'}</Text></Pressable></View>
  </Screen>;
}

const styles = StyleSheet.create({ peer: { flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 16, marginBottom: 8 }, peerCopy: { flex: 1, gap: 4 }, peerName: { color: colors.text, fontWeight: '800', fontSize: 15 }, peerEmail: { color: colors.muted, fontSize: 11 }, messageList: { paddingVertical: 14, gap: 10 }, loadOlder: { alignSelf: 'center', minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, marginBottom: 8 }, loadOlderText: { color: colors.primary, fontSize: 11, fontWeight: '800' }, emptyList: { flexGrow: 1, justifyContent: 'center' }, messageRow: { flexDirection: 'row', width: '100%' }, outgoingRow: { justifyContent: 'flex-end' }, incomingRow: { justifyContent: 'flex-start' }, bubble: { maxWidth: '84%', paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7, borderRadius: 16, gap: 5 }, outgoingBubble: { backgroundColor: colors.outgoing, borderBottomRightRadius: 5 }, incomingBubble: { backgroundColor: colors.incoming, borderBottomLeftRadius: 5 }, messageText: { color: colors.text, fontSize: 14, lineHeight: 20 }, timestamp: { color: '#D4DAEF', opacity: 0.75, fontSize: 9, alignSelf: 'flex-end' }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, paddingBottom: 3 }, input: { flex: 1, maxHeight: 120, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 14 }, send: { height: 48, width: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, sendDim: { opacity: 0.55 }, sendText: { color: colors.background, fontWeight: '900', fontSize: 25, marginTop: -3 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, helper: { color: colors.muted, fontSize: 13, lineHeight: 19 }, empty: { alignItems: 'center', gap: 8 }, emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 18 } });
