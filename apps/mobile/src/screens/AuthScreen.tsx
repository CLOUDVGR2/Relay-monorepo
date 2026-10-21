import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, getErrorMessage } from '../lib/api';
import { Screen } from '../components/Screen';
import { Brand, Button, ErrorText, Field, Heading } from '../components/Ui';
import { colors } from '../theme/colors';

type User = { _id: string; fullName: string; email: string; profilePic?: string | null };
type AuthResult = User & { accessToken: string; tokenType: 'Bearer'; expiresIn: number };

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User, token: string) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (mode === 'signup' && !fullName.trim()) return setError('Enter your full name.');
    if (!email.trim() || !password) return setError('Enter your email and password.');
    if (mode === 'signup' && password.length < 6) return setError('Password must contain at least 6 characters.');
    setBusy(true);
    try {
      const path = mode === 'login' ? '/auth/mobile/login' : '/auth/mobile/signup';
      const body = mode === 'login' ? { email: email.trim(), password } : { fullName: fullName.trim(), email: email.trim(), password };
      const { data } = await api.post<AuthResult>(path, body);
      if (!data.accessToken || !data._id) throw new Error('The server returned an invalid sign-in response.');
      await onAuthenticated({ _id: data._id, fullName: data.fullName, email: data.email, profilePic: data.profilePic }, data.accessToken);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to sign in. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return <Screen scroll>
    <View style={styles.container}>
      <Brand />
      <Heading title={mode === 'login' ? 'Welcome back.' : 'Create your account.'} subtitle={mode === 'login' ? 'Sign in to pick up where your team left off.' : 'Join your team on Relay. Your web account works here too.'} />
      {mode === 'signup' ? <Field label="FULL NAME" placeholder="Alex Morgan" value={fullName} onChangeText={setFullName} autoCapitalize="words" autoComplete="name" textContentType="name" maxLength={100} /> : null}
      <Field label="EMAIL ADDRESS" placeholder="you@company.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" maxLength={254} />
      <Field label="PASSWORD" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} textContentType={mode === 'login' ? 'password' : 'newPassword'} maxLength={72} onSubmitEditing={submit} />
      <ErrorText>{error}</ErrorText>
      <Button onPress={submit} loading={busy}>{mode === 'login' ? 'Sign in securely' : 'Create account'}</Button>
      <View style={styles.switchRow}><Text style={styles.switchText}>{mode === 'login' ? 'New to Relay?' : 'Already have an account?'}</Text><Pressable accessibilityRole="button" onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}><Text style={styles.switchLink}>{mode === 'login' ? 'Create account' : 'Sign in'}</Text></Pressable></View>
      <Text style={styles.securityNote}>Your session credential is stored using the device's secure storage.</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({ container: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 }, switchRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', marginTop: 24 }, switchText: { color: colors.muted, fontSize: 13 }, switchLink: { color: colors.primary, fontSize: 13, fontWeight: '800' }, securityNote: { color: colors.muted, opacity: 0.75, textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 26, paddingHorizontal: 18 } });
