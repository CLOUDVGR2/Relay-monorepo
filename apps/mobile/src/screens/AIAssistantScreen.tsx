import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, getErrorMessage } from '../lib/api';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';

type Citation = { title?: string; source_uri?: string; chunk_index?: number; start?: number; end?: number };
type Exchange = { id: string; question: string; answer: string; citations: Citation[] };
const suggestions = [
  'What are the main topics covered by my available documents?',
  'What troubleshooting steps are documented for common issues?',
  'Summarize the key findings in the available documentation.',
];

export function AIAssistantScreen() {
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<Exchange>>(null);

  const ask = async (prompt = question) => {
    const value = prompt.trim();
    if (!value || value.length > 2000 || busy) return;
    setQuestion(''); setError(''); setBusy(true); Keyboard.dismiss();
    try {
      const { data } = await api.post<{ answer: string; citations: Citation[] }>('/ai/answer', { question: value, top_k: 5 });
      if (typeof data.answer !== 'string' || !Array.isArray(data.citations)) throw new Error('The AI service returned an unexpected response.');
      setExchanges((current) => [...current, { id: `${Date.now()}-${current.length}`, question: value, answer: data.answer, citations: data.citations }]);
    } catch (requestError) {
      setQuestion(value);
      setError(getErrorMessage(requestError, 'The AI assistant is temporarily unavailable.'));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  };

  return <Screen>
    <View style={styles.header}><Text style={styles.eyebrow}>RELAY INTELLIGENCE</Text><Text style={styles.title}>AI Assistant</Text><Text style={styles.subtitle}>Evidence-grounded answers from your available knowledge.</Text></View>
    {exchanges.length === 0 && <View style={styles.suggestions}><Text style={styles.sectionTitle}>Try asking</Text>{suggestions.map((suggestion) => <Pressable key={suggestion} onPress={() => void ask(suggestion)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}><Text style={styles.suggestionText}>{suggestion}</Text><Text style={styles.arrow}>↗</Text></Pressable>)}</View>}
    <FlatList ref={listRef} data={exchanges} keyExtractor={(item) => item.id} contentContainerStyle={styles.exchangeList} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <View style={styles.exchange}><View style={styles.questionBubble}><Text style={styles.questionLabel}>YOU ASKED</Text><Text style={styles.questionText}>{item.question}</Text></View><View style={styles.answerCard}><Text style={styles.answerLabel}>RELAY ANSWER</Text><Text selectable style={styles.answerText}>{item.answer}</Text>{item.citations.length > 0 && <View style={styles.citations}><Text style={styles.citationHeading}>Sources · {item.citations.length}</Text>{item.citations.map((citation, index) => <View key={`${item.id}-${index}`} style={styles.citation}><Text style={styles.citationTitle}>{citation.title || `Source ${index + 1}`}</Text><Text style={styles.citationMeta}>Chunk {Number.isInteger(citation.chunk_index) ? (citation.chunk_index as number) + 1 : '—'}{Number.isInteger(citation.start) && Number.isInteger(citation.end) ? ` · Characters ${citation.start}–${citation.end}` : ''}</Text>{citation.source_uri ? <Text selectable style={styles.citationUri}>{citation.source_uri}</Text> : null}</View>)}</View>}</View></View>} />
    {busy ? <View style={styles.busy}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Searching knowledge and composing an answer…</Text></View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.composer}><TextInput accessibilityLabel="Ask the AI assistant" placeholder="Ask about your knowledge…" placeholderTextColor={colors.muted} value={question} onChangeText={setQuestion} multiline maxLength={2000} style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel="Ask question" disabled={!question.trim() || busy} onPress={() => void ask()} style={({ pressed }) => [styles.send, (!question.trim() || busy || pressed) && styles.disabled]}><Text style={styles.sendText}>↑</Text></Pressable></View>
  </Screen>;
}

const styles = StyleSheet.create({ header: { marginBottom: 18 }, eyebrow: { color: colors.primary, letterSpacing: 2, fontWeight: '800', fontSize: 10, marginBottom: 8 }, title: { color: colors.text, fontSize: 27, fontWeight: '800' }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }, suggestions: { gap: 8, marginBottom: 12 }, sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: '800', marginBottom: 2 }, suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, pressed: { opacity: 0.65 }, suggestionText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 18 }, arrow: { color: colors.primary, fontSize: 18 }, exchangeList: { paddingVertical: 8, gap: 16 }, exchange: { gap: 10 }, questionBubble: { alignSelf: 'flex-end', maxWidth: '92%', backgroundColor: colors.outgoing, borderRadius: 14, padding: 13 }, questionLabel: { color: '#DCE0FF', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 6 }, questionText: { color: colors.text, fontSize: 13, lineHeight: 19 }, answerCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 9 }, answerLabel: { color: colors.success, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, answerText: { color: colors.text, fontSize: 13, lineHeight: 21 }, citations: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 8, marginTop: 4 }, citationHeading: { color: colors.muted, fontSize: 11, fontWeight: '800' }, citation: { borderRadius: 9, padding: 10, backgroundColor: colors.surfaceRaised, gap: 4 }, citationTitle: { color: colors.text, fontSize: 11, fontWeight: '700' }, citationMeta: { color: colors.muted, fontSize: 10 }, citationUri: { color: colors.primary, fontSize: 10 }, busy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, muted: { color: colors.muted, fontSize: 11, flex: 1 }, error: { color: colors.danger, fontSize: 12, paddingVertical: 8 }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }, input: { flex: 1, maxHeight: 100, minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, color: colors.text, backgroundColor: colors.surface, fontSize: 13 }, send: { height: 46, width: 46, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.55 }, sendText: { color: colors.background, fontWeight: '900', fontSize: 24, marginTop: -3 } });
