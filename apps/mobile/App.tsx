/** Native entry point: restore a secure session, then mount authenticated navigation. */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthScreen } from './src/screens/AuthScreen';
import { ConversationsScreen } from './src/screens/ConversationsScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { ConversationScreen } from './src/screens/ConversationScreen';
import { AIAssistantScreen } from './src/screens/AIAssistantScreen';
import { ActivityInboxScreen } from './src/screens/ActivityInboxScreen';
import { NotificationPreferencesScreen } from './src/screens/NotificationPreferencesScreen';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api, getErrorMessage, setAccessToken, setUnauthorizedHandler } from './src/lib/api';
import { connectRealtime, disconnectRealtime } from './src/lib/realtime';
import { colors } from './src/theme/colors';

import type { RelayUser, RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const EAS_PROJECT_ID = '8bb6adca-f08c-4d23-8fa7-b605fba56146';
const TOKEN_KEY = 'relay.access-token';

const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: colors.primary, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, notification: colors.primary },
};

export default function App() {
  const [user, setUser] = useState<RelayUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [startupError, setStartupError] = useState('');

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!storedToken) return;
        setAccessToken(storedToken);
        const { data } = await api.get<RelayUser>('/auth/check');
        if (!active) return;
        // Create the socket before authenticated screens mount and register listeners.
        connectRealtime(storedToken);
        if (__DEV__) console.log('[AI debug] restored user prefix:', data._id.slice(0, 8));
        setUser(data);
        setToken(storedToken);
      } catch (error) {
        if (!active) return;
        setAccessToken(null);
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
        // A stale session is expected occasionally; do not expose internals.
        if (__DEV__) setStartupError(getErrorMessage(error, 'Please sign in again.'));
      } finally {
        if (active) setBooting(false);
      }
    };
    void restore();
    return () => { active = false; };
  }, []);

  // Register this device for push notifications and route taps to the
  // conversation identified by the notification payload.
  useEffect(() => {
    if (!user || !token) return;

    let active = true;
    let handledResponseId: string | null = null;

    const openNotification = async (response: Notifications.NotificationResponse) => {
      const responseId = response.notification.request.identifier;
      if (handledResponseId === responseId) return;
      handledResponseId = responseId;

      const data = response.notification.request.content.data as {
        conversationUserId?: unknown;
      };
      const peerId = String(data?.conversationUserId ?? '');

      if (!peerId || !/^[a-fA-F0-9]{24}$/.test(peerId)) return;

      try {
        const { data: people } = await api.get<RelayUser[]>('/messages/users');
        if (!active || !Array.isArray(people)) return;

        const person = people.find((candidate) => String(candidate._id) === peerId);
        if (!person || !navigationRef.isReady()) return;

        navigationRef.navigate('Conversation', { person });
      } catch {
        // A failed lookup should not crash notification handling.
      }
    };

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        void openNotification(response);
      });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active && response) void openNotification(response);
    }).catch(() => undefined);

    const registerPushToken = async () => {
      try {
        console.log("[Relay] Push device check:", { isDevice: Device.isDevice, platform: Platform.OS });
        if (!Device.isDevice) return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Messages',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
          });
        }

        const permission = await Notifications.getPermissionsAsync();
        let status = permission.status;
        if (status !== 'granted') {
          status = (await Notifications.requestPermissionsAsync()).status;
        }
        if (status !== 'granted' || !active) return;

        const result = await Notifications.getExpoPushTokenAsync({
          projectId: EAS_PROJECT_ID,
        });
        if (!active) return;

        await api.post('/notifications/device-token', {
          token: result.data,
          platform: Platform.OS === 'ios' || Platform.OS === 'android'
            ? Platform.OS
            : 'unknown',
        });
      } catch (error) {
        if (__DEV__) {
          console.warn('[Relay] Push registration unavailable:', error);
          if (error && typeof error === 'object' && 'config' in error) {
            const e = error as {
              config?: { url?: string; baseURL?: string };
              response?: { status?: number; data?: unknown };
              message?: string;
            };
            console.warn('[Relay] Push error details:', {
              url: e.config?.url,
              baseURL: e.config?.baseURL,
              status: e.response?.status,
              data: e.response?.data,
              message: e.message,
            });
          }
        }
      }
    };

    void registerPushToken();

    return () => {
      active = false;
      responseSubscription.remove();
    };
  }, [user?._id, token]);

  // Reconnect realtime when the authenticated identity or token changes.
  const userId = user?._id;

  useEffect(() => {
    if (!userId || !token) return;
    connectRealtime(token);
    return () => { disconnectRealtime(); };
  }, [userId, token]);

  const onAuthenticated = async (nextUser: RelayUser, nextToken: string) => {
    // Persist before mounting authenticated screens so an app restart can restore the session.
    await SecureStore.setItemAsync(TOKEN_KEY, nextToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    setAccessToken(nextToken);
    // Create the socket before authenticated screens mount and register listeners.
    connectRealtime(nextToken);
    if (__DEV__) console.log('[AI debug] login user prefix:', nextUser._id.slice(0, 8));
    setUser(nextUser);
    setToken(nextToken);
    setStartupError('');
  };

  // Use the same cleanup path for manual logout and expired sessions.
  const clearSession = useCallback(async () => {
    setUser(null);
    setToken(null);
    setAccessToken(null);
    disconnectRealtime();
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  }, []);

  const logout = clearSession;

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  return <SafeAreaProvider><StatusBar barStyle="light-content" backgroundColor={colors.background} /><NavigationContainer ref={navigationRef} theme={navigationTheme}>
    {booting ? <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.loadingText}>Securing your Relay session…</Text></View> : user && token ? <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: colors.background }, headerShadowVisible: false }}><Stack.Screen name="Conversations" options={{ title: 'Relay' }}>{(props) => <ConversationsScreen {...props} user={user} onLogout={logout} />}</Stack.Screen>
 <Stack.Screen name="Tasks" component={TasksScreen} options={{ title: "Tasks", headerBackTitle: "Messages" }} /><Stack.Screen name="Conversation" component={ConversationScreen} options={({ route }) => ({ title: route.params.person.fullName, headerBackTitle: 'Messages' })} /><Stack.Screen name="AI" component={AIAssistantScreen} options={{ title: 'Relay Intelligence', headerBackTitle: 'Messages' }} /><Stack.Screen name="ActivityInbox" component={ActivityInboxScreen} options={{ title: 'Activity', headerBackTitle: 'Messages' }} /><Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} options={{ title: 'Notification settings', headerBackTitle: 'Messages' }} /></Stack.Navigator> : <AuthScreen onAuthenticated={onAuthenticated} />}
    {startupError && !booting && !user ? <View accessibilityLiveRegion="polite" style={styles.startupNotice}><Text style={styles.startupNoticeText}>{startupError}</Text></View> : null}
  </NavigationContainer></SafeAreaProvider>;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.background }, loadingText: { color: colors.muted, fontSize: 13 }, startupNotice: { position: 'absolute', bottom: 14, left: 20, right: 20, padding: 10, borderRadius: 10, backgroundColor: colors.surface }, startupNoticeText: { color: colors.muted, fontSize: 11, textAlign: 'center' } });
