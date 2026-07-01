export type ChatMessageKind = "text" | "system" | "image";
export type ChatMessageStatus = "sending" | "sent" | "failed";

export interface ChatMessage {
  messageID: string;
  clientMessageId?: string;
  groupID: string;
  userID: string;
  username: string;
  text: string;
  mediaURL?: string;
  timestamp: number;
  kind?: ChatMessageKind;
  status?: ChatMessageStatus;
  recipientID?: string;
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
  const mediaURL = stringValue(data.mediaURL || data.media_url || data.mediaUrl);

  if (kind !== "system" && !text && !mediaURL) return null;

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
    username: stringValue(data.username || data.user_name || data.name || data.userID || data.userId || data.user_id),
    text,
    mediaURL: mediaURL || undefined,
    timestamp: numberValue(data.timestamp || data.timestamp_ms),
    kind,
    status:
      data.status === "sending" || data.status === "sent" || data.status === "failed"
        ? data.status
        : undefined,
    recipientID: stringValue(data.recipientID || data.recipientId || data.recipient_id) || undefined,
  };
}

export async function fetchGroupChatHistory(groupID: string, token: string, recipientID?: string): Promise<ChatMessage[]> {
  if (!groupID) return [];

  let url = `/api/groups/${encodeURIComponent(groupID)}/messages`;
  if (recipientID) {
    url += `?recipientID=${encodeURIComponent(recipientID)}`;
  }
  const response = await fetch(url, {
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