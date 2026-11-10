import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, ErrorText, Field, Heading } from '../components/Ui';
import { Screen } from '../components/Screen';
import { graphql } from '../lib/graphql';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Tasks'>;

type RelayConversation = {
  id: string;
  name?: string | null;
  description?: string | null;
  createdAt: string;
};

type Task = {
  id: string;
  conversationId: string;
  title: string;
  description?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  dueDate?: string | null;
  createdAt: string;
};

const CONVERSATIONS_QUERY = `
  query MobileTaskConversations {
    conversations {
      id
      name
      description
      createdAt
    }
  }
`;

const TASKS_QUERY = `
  query MobileTasks($input: ListTasksInput!) {
    listTasks(input: $input) {
      id
      conversationId
      title
      description
      priority
      status
      dueDate
      createdAt
    }
  }
`;

const CREATE_TASK_MUTATION = `
  mutation CreateMobileTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      id
      conversationId
      title
      description
      priority
      status
      dueDate
      createdAt
    }
  }
`;

const UPDATE_TASK_MUTATION = `
  mutation UpdateMobileTask($input: UpdateTaskInput!) {
    updateTask(input: $input) {
      id
      status
    }
  }
`;

const STATUS_LABELS: Record<Task['status'], string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

const NEXT_STATUS: Partial<Record<Task['status'], Task['status']>> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: 'TODO',
};

export function TasksScreen({ navigation }: Props) {
  const [conversations, setConversations] = useState<RelayConversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadTasks = useCallback(async (id: string) => {
    const result = await graphql<{ listTasks: Task[] }>(TASKS_QUERY, {
      input: { conversationId: id, limit: 50, offset: 0 },
    });
    setTasks(result.listTasks);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadConversations() {
      setConversationsLoading(true);
      setError('');

      try {
        const result = await graphql<{
          conversations: RelayConversation[];
        }>(CONVERSATIONS_QUERY);

        if (!active) return;

        setConversations(result.conversations);
        if (result.conversations.length > 0) {
          setConversationId((current) =>
            current && result.conversations.some((item) => item.id === current)
              ? current
              : result.conversations[0].id,
          );
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load conversations.',
          );
        }
      } finally {
        if (active) setConversationsLoading(false);
      }
    }

    void loadConversations();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function refresh() {
      if (!conversationId) {
        setTasks([]);
        setTasksLoading(false);
        return;
      }

      setTasksLoading(true);
      setError('');

      try {
        const result = await graphql<{ listTasks: Task[] }>(TASKS_QUERY, {
          input: { conversationId, limit: 50, offset: 0 },
        });
        if (active) setTasks(result.listTasks);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Could not load tasks.',
          );
        }
      } finally {
        if (active) setTasksLoading(false);
      }
    }

    void refresh();

    return () => {
      active = false;
    };
  }, [conversationId]);

  async function createTask() {
    const cleanTitle = title.trim();
    if (!conversationId || !cleanTitle || saving) return;

    setSaving(true);
    setError('');

    try {
      await graphql<{ createTask: Task }>(CREATE_TASK_MUTATION, {
        input: {
          conversationId,
          title: cleanTitle,
          description: description.trim() || null,
          priority: 'MEDIUM',
        },
      });

      setTitle('');
      setDescription('');
      await loadTasks(conversationId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not create the task.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(task: Task) {
    const nextStatus = NEXT_STATUS[task.status];
    if (!nextStatus) return;

    setError('');

    try {
      await graphql<{ updateTask: { id: string; status: Task['status'] } }>(
        UPDATE_TASK_MUTATION,
        { input: { taskId: task.id, status: nextStatus } },
      );
      await loadTasks(conversationId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update task status.',
      );
    }
  }

  const selectedConversation = conversations.find(
    (item) => item.id === conversationId,
  );

  return (
    <Screen scroll>
      <Heading
        title="Tasks"
        subtitle="Create and track work shared with your conversation."
      />

      <Text style={styles.label}>CONVERSATION</Text>
      {conversations.length > 0 ? (
        <View style={styles.conversationList}>
          {conversations.map((conversation) => {
            const selected = conversation.id === conversationId;
            return (
              <Pressable
                key={conversation.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setConversationId(conversation.id)}
                style={[
                  styles.conversationChip,
                  selected && styles.conversationChipSelected,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.conversationText,
                    selected && styles.conversationTextSelected,
                  ]}
                >
                  {conversation.name?.trim() ||
                    conversation.description?.trim() ||
                    'Conversation'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.muted}>
          {conversationsLoading
            ? 'Loading conversations…'
            : 'No accessible conversations were found for tasks.'}
        </Text>
      )}

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Create a task</Text>
        <Field
          label="TASK TITLE"
          value={title}
          onChangeText={setTitle}
          placeholder="What needs to get done?"
          maxLength={200}
          returnKeyType="done"
        />
        <Field
          label="DESCRIPTION (OPTIONAL)"
          value={description}
          onChangeText={setDescription}
          placeholder="Add details"
          multiline
          maxLength={10000}
        />
        <Button
          onPress={() => void createTask()}
          loading={saving}
          disabled={!conversationId || !title.trim()}
        >
          Create task
        </Button>
      </View>

      <View style={styles.taskHeading}>
        <Text style={styles.sectionTitle}>Tasks</Text>
        <Text style={styles.count}>{tasks.length}</Text>
      </View>

      <ErrorText>{error}</ErrorText>

      {tasksLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : !conversationId ? (
        <Text style={styles.muted}>
          Select a conversation with task access to get started.
        </Text>
      ) : tasks.length === 0 ? (
        <Text style={styles.muted}>
          No tasks yet. Create one above to get started.
        </Text>
      ) : (
        tasks.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.taskTop}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <Text style={styles.priority}>{task.priority}</Text>
            </View>
            {task.description ? (
              <Text style={styles.description}>{task.description}</Text>
            ) : null}
            {task.dueDate ? (
              <Text style={styles.muted}>
                Due {new Date(task.dueDate).toLocaleDateString()}
              </Text>
            ) : null}
            <View style={styles.taskBottom}>
              <Text
                style={[
                  styles.status,
                  task.status === 'DONE' && styles.doneStatus,
                ]}
              >
                {STATUS_LABELS[task.status]}
              </Text>
              {NEXT_STATUS[task.status] ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${task.status === 'DONE' ? 'Reopen' : 'Advance status for'} task: ${task.title}`}
                  onPress={() => void changeStatus(task)}
                  style={styles.statusButton}
                >
                  <Text style={styles.statusButtonText}>
                    {task.status === 'DONE' ? 'Reopen' : 'Advance status'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))
      )}

      {selectedConversation ? (
        <Text style={styles.footer}>
          Showing tasks for{' '}
          {selectedConversation.name?.trim() || 'the selected conversation'}.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  conversationList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  conversationChip: {
    maxWidth: '100%',
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: colors.surface,
  },
  conversationChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  conversationText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  conversationTextSelected: { color: colors.background, fontWeight: '800' },
  form: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 26,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  taskHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
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
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    marginBottom: 12,
    gap: 10,
  },
  taskTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  taskTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  priority: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  taskBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  status: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  doneStatus: { color: colors.success },
  statusButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  statusButtonText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  loader: { marginVertical: 24 },
  footer: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
    marginBottom: 12,
  },
});
