/** Native entry point: restore a secure session, then mount authenticated navigation. */
import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthScreen } from './src/screens/AuthScreen';
import { ConversationsScreen } from './src/screens/ConversationsScreen';
import { ConversationScreen } from './src/screens/ConversationScreen';
import { AIAssistantScreen } from './src/screens/AIAssistantScreen';
import { api, getErrorMessage, setAccessToken, setUnauthorizedHandler } from './src/lib/api';
import { connectRealtime, disconnectRealtime } from './src/lib/realtime';
import { colors } from './src/theme/colors';

type User = { _id: string; fullName: string; email: string; profilePic?: string | null };
type RootStackParamList = { Conversations: undefined; Conversation: { person: User }; AI: undefined };
const Stack = createNativeStackNavigator<RootStackParamList>();
const TOKEN_KEY = 'relay.access-token';

const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: colors.primary, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, notification: colors.primary },
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
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
        const { data } = await api.get<User>('/auth/check');
        if (!active) return;
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

  useEffect(() => {
    if (!user || !token) return;
    connectRealtime(token);
    return () => { disconnectRealtime(); };
  }, [user?._id, token]);

  const onAuthenticated = async (nextUser: User, nextToken: string) => {
    // Persist before mounting authenticated screens so an app restart can restore the session.
    await SecureStore.setItemAsync(TOKEN_KEY, nextToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    setAccessToken(nextToken);
    setUser(nextUser);
    setToken(nextToken);
    setStartupError('');
  };

  const logout = async () => {
    // JWTs are currently stateless; local logout removes this device's credential.
    setUser(null);
    setToken(null);
    setAccessToken(null);
    disconnectRealtime();
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setToken(null);
      setAccessToken(null);
      disconnectRealtime();
      void SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return <SafeAreaProvider><StatusBar barStyle="light-content" backgroundColor={colors.background} /><NavigationContainer theme={navigationTheme}>
    {booting ? <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.loadingText}>Securing your Relay session…</Text></View> : user && token ? <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: colors.background }, headerShadowVisible: false }}><Stack.Screen name="Conversations" options={{ title: 'Relay' }}>{(props) => <ConversationsScreen {...props} user={user} onLogout={logout} />}</Stack.Screen><Stack.Screen name="Conversation" component={ConversationScreen} options={({ route }) => ({ title: route.params.person.fullName, headerBackTitle: 'Messages' })} /><Stack.Screen name="AI" component={AIAssistantScreen} options={{ title: 'Relay Intelligence', headerBackTitle: 'Messages' }} /></Stack.Navigator> : <AuthScreen onAuthenticated={onAuthenticated} />}
    {startupError && !booting && !user ? <View accessibilityLiveRegion="polite" style={styles.startupNotice}><Text style={styles.startupNoticeText}>{startupError}</Text></View> : null}
  </NavigationContainer></SafeAreaProvider>;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.background }, loadingText: { color: colors.muted, fontSize: 13 }, startupNotice: { position: 'absolute', bottom: 14, left: 20, right: 20, padding: 10, borderRadius: 10, backgroundColor: colors.surface }, startupNoticeText: { color: colors.muted, fontSize: 11, textAlign: 'center' } });
