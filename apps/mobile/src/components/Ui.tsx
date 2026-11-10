import type { ComponentProps, PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';

export function Brand() {
  return (
    <View style={styles.brand}>
      <Svg width={48} height={48} viewBox="0 0 48 48">
        <Rect width={48} height={48} rx={14} fill="#0f172a" />
        <G
          transform="translate(6 6) scale(1.5)"
          fill="none"
          stroke="#93c5fd"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
        </G>
      </Svg>
      <View>
        <Text style={styles.brandName}>Relay</Text>
        <Text style={styles.brandCaption}>Conversations that move work forward</Text>
      </View>
    </View>
  );
}

export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.heading}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
}

export function Field(props: ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={colors.muted} accessibilityLabel={label} autoCapitalize="none" style={styles.input} {...inputProps} /></View>;
}

export function Button({ children, onPress, loading = false, disabled = false, secondary = false }: PropsWithChildren<{ onPress: () => void; loading?: boolean; disabled?: boolean; secondary?: boolean }>) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, (pressed || disabled || loading) && styles.buttonDim]}>{loading ? <ActivityIndicator color={secondary ? colors.text : colors.background} /> : <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{children}</Text>}</Pressable>;
}

export function ErrorText({ children }: PropsWithChildren) {
  if (!children) return null;
  return <Text accessibilityRole="alert" style={styles.error}>{children}</Text>;
}

export function Avatar({ name, size = 46 }: { name?: string; size?: number }) {
  const initials = (name || 'R').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}><Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials || 'R'}</Text></View>;
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 44 },
  brandName: { color: colors.text, fontWeight: '800', fontSize: 23, letterSpacing: 0.2 },
  brandCaption: { color: colors.muted, fontSize: 11, marginTop: 2 },
  heading: { marginBottom: 24, gap: 7 },
  title: { color: colors.text, fontSize: 29, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  field: { gap: 8, marginBottom: 16 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  input: { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 13, minHeight: 52, paddingHorizontal: 15, fontSize: 15 },
  button: { minHeight: 52, paddingHorizontal: 18, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: colors.background, fontSize: 15, fontWeight: '800' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.text },
  buttonDim: { opacity: 0.65 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  avatar: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '800' },
});
