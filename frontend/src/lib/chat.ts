export type ChatMessageKind = "text" | "system";
export type ChatMessageStatus = "sending" | "sent" | "failed";

export interface ChatMessage {
  messageID: string;
  clientMessageId?: string;
  groupID: string;
  userID: string;
  username: string;
  text: string;
  timestamp: number;
  kind?: ChatMessageKind;
  status?: ChatMessageStatus;
}

type HistoryResponse = {
  items?: unknown[];
  messages?: unknown[];
};

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = Date.now()): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function chatMessageKey(message: ChatMessage): string {
  return (
    message.clientMessageId ||
    message.messageID ||
    `${message.userID}:${message.timestamp}:${message.text}`
  );
}

export function normalizeChatMessage(input: unknown): ChatMessage | null {
  if (!input || typeof input !== "object") return null;

  const data = input as Record<string, unknown>;
  const kind = stringValue(data.kind, "text") as ChatMessageKind;
  const text = stringValue(data.text).trim();

  if (kind !== "system" && !text) return null;

  const clientMessageId = stringValue(data.clientMessageId || data.client_message_id);
  const messageID = stringValue(
    data.messageID || data.messageId || data.message_id || data.id || clientMessageId || "",
    clientMessageId || `${stringValue(data.userID || data.userId || data.user_id)}:${numberValue(data.timestamp || data.timestamp_ms)}:${text}`
  );

  return {
    messageID,
    clientMessageId: clientMessageId || undefined,
    groupID: stringValue(data.groupID || data.groupId || data.group_id),
    userID: stringValue(data.userID || data.userId || data.user_id),
    username: stringValue(data.username || data.user_name || data.name),
    text,
    timestamp: numberValue(data.timestamp || data.timestamp_ms),
    kind,
    status:
      data.status === "sending" || data.status === "sent" || data.status === "failed"
        ? data.status
        : undefined,
  };
}

export async function fetchGroupChatHistory(groupID: string, token: string): Promise<ChatMessage[]> {
  if (!groupID) return [];

  const response = await fetch(`/api/groups/${encodeURIComponent(groupID)}/messages`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) return [];

  const data = (await response.json().catch(() => null)) as HistoryResponse | ChatMessage[] | null;
  const rawItems = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.messages)
        ? data.messages
        : [];

  return rawItems
    .map((item) => normalizeChatMessage(item))
    .filter((item): item is ChatMessage => item !== null)
    .sort((left, right) => left.timestamp - right.timestamp);
}