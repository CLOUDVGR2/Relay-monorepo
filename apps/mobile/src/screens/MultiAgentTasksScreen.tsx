import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, ErrorText, Field, Heading } from '../components/Ui';
import { Screen } from '../components/Screen';
import { api, getErrorMessage } from '../lib/api';
import { getRealtimeSocket } from '../lib/realtime';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'MultiAgentTasks'>;

type AgentRole = 'planner' | 'executor' | 'memory' | 'reviewer' | 'coordinator';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
type Phase = 'planning' | 'executing' | 'reviewing' | 'completed' | 'failed';

type ProgressStep = {
  step_id: string;
  role: AgentRole;
  status: StepStatus;
};

type Progress = {
  phase: Phase;
  steps: ProgressStep[];
};

type MultiAgentTask = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: Progress;
  result: Record<string, unknown> | null;
  error_code: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

const TASKS_PAGE_SIZE = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PHASES = new Set<Phase>([
  'planning',
  'executing',
  'reviewing',
  'completed',
  'failed',
]);

const ROLES = new Set<AgentRole>([
  'planner',
  'executor',
  'memory',
  'reviewer',
  'coordinator',
]);

const STEP_STATUSES = new Set<StepStatus>([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);

const TASK_STATUSES = new Set<MultiAgentTask['status']>([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

const PHASE_LABELS: Record<Phase, string> = {
  planning: 'Planning',
  executing: 'Executing',
  reviewing: 'Reviewing',
  completed: 'Completed',
  failed: 'Failed',
};

const TASK_STATUS_LABELS: Record<MultiAgentTask['status'], string> = {
  queued: 'Queued',
  running: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending: 'Waiting',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
};

const TERMINAL_STATUSES = new Set<MultiAgentTask['status']>([
  'completed',
  'failed',
  'cancelled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isProgress(value: unknown): value is Progress {
  if (!isRecord(value) || !PHASES.has(value.phase as Phase)) return false;
  if (!Array.isArray(value.steps) || value.steps.length > 12) return false;

  const seen = new Set<string>();

  for (const candidate of value.steps) {
    if (!isRecord(candidate)) return false;

    const { step_id, role, status } = candidate;

    if (
      typeof step_id !== 'string' ||
      !/^[a-z][a-z0-9_-]{0,63}$/.test(step_id) ||
      seen.has(step_id) ||
      !ROLES.has(role as AgentRole) ||
      !STEP_STATUSES.has(status as StepStatus)
    ) {
      return false;
    }

    seen.add(step_id);
  }

  return true;
}

function isTask(value: unknown): value is MultiAgentTask {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    UUID_RE.test(value.id) &&
    TASK_STATUSES.has(value.status as MultiAgentTask['status']) &&
    isProgress(value.progress) &&
    (value.result === null || isRecord(value.result)) &&
    (value.error_code === null || typeof value.error_code === 'string') &&
    Number.isInteger(value.attempt_count) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    (value.started_at === null || typeof value.started_at === 'string') &&
    (value.finished_at === null || typeof value.finished_at === 'string')
  );
}

function isProgressEvent(value: unknown): value is {
  task_id: string;
  progress: Progress;
} {
  return (
    isRecord(value) &&
    typeof value.task_id === 'string' &&
    UUID_RE.test(value.task_id) &&
    isProgress(value.progress)
  );
}

function phaseToTaskStatus(phase: Phase): MultiAgentTask['status'] {
  if (phase === 'completed') return 'completed';
  if (phase === 'failed') return 'failed';
  return 'running';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

export function MultiAgentTasksScreen({ navigation }: Props) {
  const [prompt, setPrompt] = useState('');
  const [maxSteps, setMaxSteps] = useState(8);
  const [tasks, setTasks] = useState<MultiAgentTask[]>([]);
  const [historyVisible, setHistoryVisible] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const historyPageCount = Math.max(
    1,
    Math.ceil(tasks.length / TASKS_PAGE_SIZE),
  );
  const safeHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleTasks = tasks.slice(
    (safeHistoryPage - 1) * TASKS_PAGE_SIZE,
    safeHistoryPage * TASKS_PAGE_SIZE,
  );

  const activeRef = useRef(false);
  const requestSequence = useRef(0);
  const progressRevision = useRef(0);
  const submittingRef = useRef(false);

  const loadTasks = useCallback(async (showLoader = false) => {
    const sequence = ++requestSequence.current;
    const revisionAtStart = progressRevision.current;

    if (showLoader) setRefreshing(true);

    try {
      const response = await api.get<unknown>(
        '/ai/multi-agent/tasks?limit=50&offset=0',
      );

      if (!activeRef.current || sequence !== requestSequence.current) return;

      if (!Array.isArray(response.data) || !response.data.every(isTask)) {
        throw new Error('Relay returned an invalid multi-agent task response.');
      }

      // Every item has passed the runtime validator above.
      const loadedTasks = response.data as MultiAgentTask[];

      setTasks((current) => {
        // Preserve socket progress received while this HTTP request was in flight.
        if (revisionAtStart !== progressRevision.current) {
          const latestById = new Map(current.map((task) => [task.id, task]));

          return loadedTasks.map((task) => {
            const latest = latestById.get(task.id);
            return latest ?? task;
          });
        }

        return loadedTasks;
      });

      setError('');
    } catch (requestError) {
      if (activeRef.current && sequence === requestSequence.current) {
        setError(
          getErrorMessage(requestError, 'Could not load multi-agent tasks.'),
        );
      }
    } finally {
      if (activeRef.current && sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;
      void loadTasks();

      return () => {
        activeRef.current = false;
        requestSequence.current += 1;
      };
    }, [loadTasks]),
  );

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket) return;

    const onConnect = () => {
      if (activeRef.current) void loadTasks();
    };

    const onProgress = (payload: unknown) => {
      if (!isProgressEvent(payload)) return;
      if (!activeRef.current) return;

      progressRevision.current += 1;

      setTasks((current) =>
        current.map((task) => {
          if (task.id !== payload.task_id) return task;

          // Never allow a late running event to undo a terminal task.
          if (TERMINAL_STATUSES.has(task.status)) return task;

          return {
            ...task,
            status: phaseToTaskStatus(payload.progress.phase),
            progress: payload.progress,
          };
        }),
      );
    };

    socket.on('connect', onConnect);
    socket.on('multiAgentTaskProgress', onProgress);

    return () => {
      socket.off('connect', onConnect);
      socket.off('multiAgentTaskProgress', onProgress);
    };
  }, [loadTasks]);

  async function submitTask() {
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setError('');

    try {
      const response = await api.post<unknown>('/ai/multi-agent/tasks', {
        prompt: cleanPrompt,
        max_steps: maxSteps,
        timeout_seconds: 30,
      });

      if (!isTask(response.data)) {
        throw new Error('Relay returned an invalid created-task response.');
      }

      const createdTask = response.data;
      setTasks((current) => [
        createdTask,
        ...current.filter((task) => task.id !== createdTask.id),
      ].slice(0, 50));

      setPrompt('');
      void loadTasks();
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'Could not submit the multi-agent task.'),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <Heading
        title="Multi-Agent Tasks"
        subtitle="Delegate work and follow each agent's progress."
      />

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Start a task</Text>
        <Field
          label="PROMPT"
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Describe the work you want the agents to do"
          multiline
          maxLength={4000}
        />

        <Text style={styles.label}>MAXIMUM STEPS</Text>
        <View style={styles.stepControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease maximum steps"
            disabled={maxSteps <= 1}
            onPress={() => setMaxSteps((value) => Math.max(1, value - 1))}
            style={[styles.stepButton, maxSteps <= 1 && styles.disabled]}
          >
            <Text style={styles.stepButtonText}>−</Text>
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={styles.stepCount}>
            {maxSteps}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase maximum steps"
            disabled={maxSteps >= 12}
            onPress={() => setMaxSteps((value) => Math.min(12, value + 1))}
            style={[styles.stepButton, maxSteps >= 12 && styles.disabled]}
          >
            <Text style={styles.stepButtonText}>+</Text>
          </Pressable>
        </View>

        <Button
          onPress={() => void submitTask()}
          loading={submitting}
          disabled={!prompt.trim() || submitting}
        >
          Submit task
        </Button>
      </View>

      <View style={styles.taskHeading}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={historyVisible ? 'Hide recent runs' : 'Show recent runs'}
          onPress={() => setHistoryVisible((visible) => !visible)}
          style={styles.taskHeadingToggle}
        >
          <Text style={styles.sectionTitle}>Recent runs</Text>
          <Text style={styles.count}>{tasks.length}</Text>
          <MaterialCommunityIcons
            name={historyVisible ? 'chevron-up' : 'chevron-down'}
            size={22}
            color={colors.primary}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={refreshing}
          onPress={() => void loadTasks(true)}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshText}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Text>
        </Pressable>
      </View>

      <ErrorText>{error}</ErrorText>

      {historyVisible ? (
        loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : tasks.length === 0 ? (
        <Text style={styles.muted}>
          No multi-agent tasks yet. Submit a prompt above to get started.
        </Text>
      ) : (
        <>
          {visibleTasks.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.taskTop}>
              <Text style={styles.taskTitle} numberOfLines={4}>
                {typeof task.result?.title === 'string'
                  ? task.result.title
                  : `Task ${task.id.slice(0, 8)}`}
              </Text>
              <Text
                style={[
                  styles.status,
                  task.status === 'completed' && styles.completed,
                  task.status === 'failed' && styles.failed,
                ]}
              >
                {TASK_STATUS_LABELS[task.status]}
              </Text>
            </View>

            <Text style={styles.muted}>
              Created {formatDate(task.created_at)}
            </Text>

            <View style={styles.phaseRow}>
              <Text style={styles.label}>CURRENT PHASE</Text>
              <Text style={styles.phase}>
                {PHASE_LABELS[task.progress.phase]}
              </Text>
            </View>

            {task.progress.steps.length === 0 ? (
              <Text style={styles.muted}>Waiting for the execution plan…</Text>
            ) : (
              <View style={styles.steps}>
                {task.progress.steps.map((step) => (
                  <View key={step.step_id} style={styles.stepRow}>
                    <View
                      style={[
                        styles.stepDot,
                        step.status === 'completed' && styles.dotCompleted,
                        step.status === 'running' && styles.dotRunning,
                        step.status === 'failed' && styles.dotFailed,
                      ]}
                    />
                    <View style={styles.stepDetails}>
                      <Text style={styles.stepRole}>{step.role}</Text>
                      <Text style={styles.stepId}>{step.step_id}</Text>
                    </View>
                    <Text style={styles.stepStatus}>
                      {STEP_STATUS_LABELS[step.status]}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {task.status === 'failed' ? (
              <Text style={styles.failedNote}>
                This task failed. You can submit a new task to try again.
              </Text>
            ) : null}

            <Text style={styles.footer}>
              Attempt {task.attempt_count}
              {task.finished_at
                ? ` · Finished ${formatDate(task.finished_at)}`
                : ''}
            </Text>
          </View>
          ))}
          {historyPageCount > 1 ? (
            <View style={styles.historyPagination}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous recent runs page"
                disabled={safeHistoryPage === 1}
                onPress={() => setHistoryPage((page) => Math.max(1, safeHistoryPage - 1))}
                style={[
                  styles.pageArrow,
                  safeHistoryPage === 1 && styles.pageArrowDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={22}
                  color={safeHistoryPage === 1 ? colors.muted : colors.primary}
                />
              </Pressable>
              <Text accessibilityLiveRegion="polite" style={styles.pageIndicator}>
                Page {safeHistoryPage} of {historyPageCount}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next recent runs page"
                disabled={safeHistoryPage === historyPageCount}
                onPress={() =>
                  setHistoryPage(Math.min(historyPageCount, safeHistoryPage + 1))
                }
                style={[
                  styles.pageArrow,
                  safeHistoryPage === historyPageCount && styles.pageArrowDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={
                    safeHistoryPage === historyPageCount
                      ? colors.muted
                      : colors.primary
                  }
                />
              </Pressable>
            </View>
          ) : null}
        </>
      )) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 18,
    marginBottom: 26,
    gap: 12,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  stepControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: { color: colors.text, fontSize: 22, fontWeight: '700' },
  stepCount: {
    minWidth: 24,
    color: colors.text,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
  },
  disabled: { opacity: 0.4 },
  taskHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  taskHeadingToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  count: {
    color: colors.primary,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
    fontWeight: '800',
  },
  refreshButton: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  refreshText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  historyPagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  pageArrow: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  pageArrowDisabled: { opacity: 0.45 },
  pageIndicator: {
    minWidth: 88,
    textAlign: 'center',
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    marginBottom: 12,
    gap: 12,
  },
  taskTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  taskTitle: { color: colors.text, fontSize: 15, fontWeight: '800', flex: 1 },
  status: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  completed: { color: colors.success },
  failed: { color: colors.primary },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  phase: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  steps: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 12,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.muted,
  },
  dotCompleted: { backgroundColor: colors.success },
  dotRunning: { backgroundColor: colors.primary },
  dotFailed: { backgroundColor: colors.primary },
  stepDetails: { flex: 1, gap: 2 },
  stepRole: { color: colors.text, fontSize: 13, fontWeight: '700' },
  stepId: { color: colors.muted, fontSize: 11 },
  stepStatus: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  failedNote: { color: colors.primary, fontSize: 12, lineHeight: 18 },
  footer: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  loader: { marginVertical: 24 },
});
