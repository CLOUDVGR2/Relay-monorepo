import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, getErrorMessage } from '../lib/api';
import { ErrorText, Heading } from '../components/Ui';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import type { RelayUser, RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationPreferences'>;

type QuietHours = {
  enabled: boolean;
  start: string;
  end: string;
  timeZone: string;
};

type Preferences = {
  pushEnabled: boolean;
  mutedConversationIds: string[];
  quietHours: QuietHours;
};

const defaultPreferences: Preferences = {
  pushEnabled: true,
  mutedConversationIds: [],
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  },
};

const validClock = (value: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function NotificationPreferencesScreen({}: Props) {
  const [people, setPeople] = useState<RelayUser[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [peopleResponse, preferencesResponse] = await Promise.all([
        api.get<RelayUser[]>('/messages/users'),
        api.get<Preferences>('/notifications/preferences'),
      ]);
      setPeople(Array.isArray(peopleResponse.data) ? peopleResponse.data : []);
      setPreferences({
        ...defaultPreferences,
        ...preferencesResponse.data,
        quietHours: {
          ...defaultPreferences.quietHours,
          ...preferencesResponse.data.quietHours,
        },
        mutedConversationIds: Array.isArray(
          preferencesResponse.data.mutedConversationIds,
        )
          ? preferencesResponse.data.mutedConversationIds.map(String)
          : [],
      });
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load notification preferences.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(initialLoad);
  }, [load]);

  const toggleMuted = (personId: string, muted: boolean) => {
    setSaved(false);
    setPreferences((current) => {
      const ids = new Set(current.mutedConversationIds.map(String));
      if (muted) ids.add(String(personId));
      else ids.delete(String(personId));
      return { ...current, mutedConversationIds: [...ids] };
    });
  };

  const save = async () => {
    if (
      !validClock(preferences.quietHours.start) ||
      !validClock(preferences.quietHours.end) ||
      !preferences.quietHours.timeZone.trim()
    ) {
      setError('Use HH:MM for quiet-hours times and enter a time zone such as America/New_York.');
      return;
    }

    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const { data } = await api.put<Preferences>(
        '/notifications/preferences',
        preferences,
      );
      setPreferences({
        ...preferences,
        ...data,
        quietHours: { ...preferences.quietHours, ...data.quietHours },
      });
      setSaved(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to save notification preferences.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Loading preferences…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Heading title="Notifications" subtitle="Choose when Relay can interrupt you." />
        <ErrorText>{error}</ErrorText>
        {saved ? <Text accessibilityLiveRegion="polite" style={styles.success}>Preferences saved.</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push notifications</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Allow push notifications</Text>
              <Text style={styles.muted}>Turn off to stop push alerts while keeping activity in your inbox.</Text>
            </View>
            <Switch
              value={preferences.pushEnabled}
              onValueChange={(pushEnabled) => {
                setSaved(false);
                setPreferences((current) => ({ ...current, pushEnabled }));
              }}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Muted conversations</Text>
          <Text style={styles.muted}>Muted conversations still appear in your inbox, but won’t send push alerts.</Text>
          {people.map((person) => {
            const muted = preferences.mutedConversationIds.includes(String(person._id));
            return (
              <View key={person._id} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.label}>{person.fullName}</Text>
                  <Text style={styles.muted}>{muted ? 'Muted' : 'Notifications on'}</Text>
                </View>
                <Switch
                  value={muted}
                  onValueChange={(value) => toggleMuted(String(person._id), value)}
                  trackColor={{ true: colors.primary }}
                />
              </View>
            );
          })}
          {!people.length ? <Text style={styles.muted}>No contacts to configure yet.</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quiet hours</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Enable quiet hours</Text>
              <Text style={styles.muted}>Push alerts are suppressed during this interval.</Text>
            </View>
            <Switch
              value={preferences.quietHours.enabled}
              onValueChange={(enabled) => {
                setSaved(false);
                setPreferences((current) => ({
                  ...current,
                  quietHours: { ...current.quietHours, enabled },
                }));
              }}
              trackColor={{ true: colors.primary }}
            />
          </View>

          <Text style={styles.fieldLabel}>Start time (24-hour HH:MM)</Text>
          <TextInput
            accessibilityLabel="Quiet hours start time"
            value={preferences.quietHours.start}
            onChangeText={(start) => {
              setSaved(false);
              setPreferences((current) => ({
                ...current,
                quietHours: { ...current.quietHours, start },
              }));
            }}
            placeholder="22:00"
            placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
            maxLength={5}
          />

          <Text style={styles.fieldLabel}>End time (24-hour HH:MM)</Text>
          <TextInput
            accessibilityLabel="Quiet hours end time"
            value={preferences.quietHours.end}
            onChangeText={(end) => {
              setSaved(false);
              setPreferences((current) => ({
                ...current,
                quietHours: { ...current.quietHours, end },
              }));
            }}
            placeholder="08:00"
            placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
            maxLength={5}
          />

          <Text style={styles.fieldLabel}>IANA time zone</Text>
          <TextInput
            accessibilityLabel="Quiet hours time zone"
            value={preferences.quietHours.timeZone}
            onChangeText={(timeZone) => {
              setSaved(false);
              setPreferences((current) => ({
                ...current,
                quietHours: { ...current.quietHours, timeZone },
              }));
            }}
            placeholder="America/New_York"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Text style={styles.muted}>
            Example: America/New_York. Quiet hours can cross midnight.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void save()}
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, saving && styles.disabledButton]}
        >
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save preferences'}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingBottom: 32 },
  section: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  flex: { flex: 1, gap: 4 },
  label: { color: colors.text, fontSize: 13, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  fieldLabel: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 4 },
  input: { color: colors.text, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  saveButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  pressed: { opacity: 0.75 },
  disabledButton: { opacity: 0.5 },
  success: { color: colors.success, fontSize: 13, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
