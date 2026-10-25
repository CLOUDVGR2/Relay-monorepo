import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, getErrorMessage } from '../lib/api';
import { Avatar, ErrorText, Heading } from '../components/Ui';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import type { RelayUser, RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ActivityInbox'>;

type ActivityNotification = {
  _id: string;
  type: 'message' | 'mention';
  title: string;
  body: string;
  conversationUserId: string;
  messageId?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export function ActivityInboxScreen({ navigation }: Props) {
  const [items, setItems] = useState<ActivityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const { data } = await api.get<{
        notifications: ActivityNotification[];
        unreadCount: number;
      }>('/notifications');

      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount) || 0);
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load activity.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      void load();
    });
    const initialLoad = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      clearTimeout(initialLoad);
      unsubscribe();
    };
  }, [navigation, load]);

  const openItem = async (item: ActivityNotification) => {
    try {
      if (!item.readAt) {
        await api.patch(`/notifications/${item._id}/read`);
        setItems((current) =>
          current.map((entry) =>
            entry._id === item._id
              ? { ...entry, readAt: new Date().toISOString() }
              : entry,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      }

      const { data } = await api.get<RelayUser[]>('/messages/users');
      const people = Array.isArray(data) ? data : [];
      const person = people.find(
        (candidate) =>
          String(candidate._id) === String(item.conversationUserId),
      );

      if (!person) {
        setError('This conversation is no longer available.');
        return;
      }

      navigation.navigate('Conversation', { person });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to open this activity.'));
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setItems((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt || new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to mark activity as read.'));
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Heading
          title="Activity"
          subtitle={unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}
        />
        <Pressable
          accessibilityRole="button"
          disabled={unreadCount === 0}
          onPress={() => void markAllRead()}
          style={styles.action}
        >
          <Text style={[styles.actionText, unreadCount === 0 && styles.disabled]}>
            Mark all read
          </Text>
        </Pressable>
      </View>

      <ErrorText>{error}</ErrorText>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Loading activity…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={items.length ? styles.list : styles.emptyList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open notification from ${item.title}`}
              onPress={() => void openItem(item)}
              style={({ pressed }) => [
                styles.item,
                !item.readAt && styles.unreadItem,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.avatar}>
                <Avatar name={item.title} />
              </View>
              <View style={styles.details}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body} numberOfLines={3}>{item.body}</Text>
                <Text style={styles.date}>
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
              </View>
              {!item.readAt ? <View style={styles.unreadDot} /> : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.muted}>
                New messages and mentions will appear here.
              </Text>
            </View>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  action: { padding: 8 },
  actionText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  list: { paddingTop: 12, paddingBottom: 30 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  unreadItem: { backgroundColor: colors.surface },
  pressed: { opacity: 0.65 },
  avatar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  details: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  date: { color: colors.muted, fontSize: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  empty: { alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
});
