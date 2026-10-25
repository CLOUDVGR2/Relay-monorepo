import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api, getErrorMessage } from '../lib/api';
import { getRealtimeSocket } from '../lib/realtime';
import { Avatar, ErrorText, Heading } from '../components/Ui';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RelayUser, RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Conversations'> & {
  user: RelayUser;
  onLogout: () => Promise<void>;
};

export function ConversationsScreen({ navigation, user, onLogout }: Props) {
  const [people, setPeople] = useState<RelayUser[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  // Derive initial loading from whether the first contacts request has finished.
  const [hasLoadedPeople, setHasLoadedPeople] = useState(false);
  const loading = !hasLoadedPeople;
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Keep track of the request so it can be cancelled when this screen unmounts.
  const peopleRequest = useRef<AbortController | null>(null);

  const loadPeople = useCallback(async (isRefresh = false) => {
    // Cancel an older request before starting another one.
    peopleRequest.current?.abort();
    const controller = new AbortController();
    peopleRequest.current = controller;

    if (isRefresh) setRefreshing(true);

    try {
      const response = await api.get<RelayUser[]>('/messages/users', {
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      setPeople(Array.isArray(response.data) ? response.data : []);
      setError('');
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setError(getErrorMessage(requestError, 'Unable to load your contacts.'));
    } finally {
      if (peopleRequest.current === controller) {
        peopleRequest.current = null;
        setHasLoadedPeople(true);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    // Start loading after the effect finishes its synchronous phase.
    const timer = setTimeout(() => {
      void loadPeople();
    }, 0);

    return () => {
      clearTimeout(timer);
      peopleRequest.current?.abort();
    };
  }, [loadPeople]);
  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket) return;
    const updateOnline = (ids: string[]) => setOnline(Array.isArray(ids) ? ids.map(String) : []);
    socket.on('getOnlineUsers', updateOnline);
    return () => { socket.off('getOnlineUsers', updateOnline); };
  }, []);

  return <Screen>
    <View style={styles.top}><View><Text style={styles.eyebrow}>YOUR WORKSPACE</Text><Heading title="Messages" subtitle={`Signed in as ${user.fullName}`} /></View><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => navigation.navigate('Tasks')} style={[styles.aiButton, { marginRight: 8 }]}><Text style={styles.aiButtonText}>Tasks</Text></Pressable><Pressable accessibilityRole="button" onPress={() => navigation.navigate('AI')} style={styles.aiButton}><Text style={styles.aiButtonText}>✦ AI</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void onLogout()} style={styles.logout}><Text style={styles.logoutText}>Log out</Text></Pressable></View></View>
    <ErrorText>{error}</ErrorText>
    {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.muted}>Loading your people…</Text></View> : <FlatList data={people} keyExtractor={(person) => person._id} contentContainerStyle={people.length ? styles.list : styles.emptyList} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadPeople(true)} tintColor={colors.primary} />} renderItem={({ item }) => {
      const isOnline = online.includes(String(item._id));
      return <Pressable accessibilityRole="button" accessibilityLabel={`Message ${item.fullName}`} onPress={() => navigation.navigate('Conversation', { person: item })} style={({ pressed }) => [styles.person, pressed && styles.pressed]}><View><Avatar name={item.fullName} /><View style={[styles.presence, isOnline && styles.presenceOnline]} /></View><View style={styles.personDetails}><Text style={styles.personName}>{item.fullName}</Text><Text style={styles.personEmail} numberOfLines={1}>{item.email}</Text></View><View style={styles.personRight}><View style={[styles.statusDot, isOnline && styles.statusOnline]} /><Text style={styles.statusText}>{isOnline ? 'Online' : 'Open chat'}</Text></View></Pressable>;
    }} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Your conversations start here</Text><Text style={styles.muted}>There are no other Relay users to message yet.</Text></View>} />}
  </Screen>;
}

const styles = StyleSheet.create({ top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, actions: { flexDirection: 'row', alignItems: 'center', gap: 7 }, aiButton: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, marginTop: 5 }, aiButtonText: { color: colors.primary, fontSize: 12, fontWeight: '800' }, eyebrow: { color: colors.primary, fontSize: 10, letterSpacing: 2, fontWeight: '800', marginBottom: 10 }, logout: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderColor: colors.border, borderWidth: 1, marginTop: 5 }, logoutText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, list: { paddingTop: 12, paddingBottom: 30 }, emptyList: { flexGrow: 1, justifyContent: 'center' }, person: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 }, pressed: { opacity: 0.65 }, personDetails: { flex: 1, gap: 4 }, personName: { color: colors.text, fontWeight: '700', fontSize: 15 }, personEmail: { color: colors.muted, fontSize: 12 }, personRight: { alignItems: 'flex-end', gap: 5 }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted }, statusOnline: { backgroundColor: colors.success }, statusText: { color: colors.muted, fontSize: 10 }, presence: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: colors.muted, borderWidth: 2, borderColor: colors.background, right: 0, bottom: 0 }, presenceOnline: { backgroundColor: colors.success }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, muted: { color: colors.muted, fontSize: 13, lineHeight: 19 }, empty: { alignItems: 'center', gap: 8, paddingHorizontal: 18 }, emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' } });
