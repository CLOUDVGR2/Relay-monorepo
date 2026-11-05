// Shared user and route types keep navigation contracts consistent.
export type RelayUser = {
  _id: string;
  fullName: string;
  email: string;
  profilePic?: string | null;
};

// Keep every stack destination and its parameters in one place.
export type RootStackParamList = {
  Conversations: undefined;
  Calls: { callId?: string } | undefined;
  Tasks: undefined;
  MultiAgentTasks: undefined;
  Conversation: { person: RelayUser };
  AI: undefined;
  ActivityInbox: undefined;
  NotificationPreferences: undefined;
};
