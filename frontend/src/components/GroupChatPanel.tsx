import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Image, MessageSquare, Send, X } from "lucide-react";

import { chatMessageKey, fetchGroupChatHistory, normalizeChatMessage, type ChatMessage } from "../lib/chat";
import { sendWsMessage, useAppStore } from "../store/useAppStore";

type GroupChatPanelProps = {
  isOpen: boolean;
  onToggle: () => void;
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GroupChatPanel({ isOpen, onToggle }: GroupChatPanelProps) {
  const groupId = useAppStore((state) => state.groupId);
  const token = useAppStore((state) => state.token);
  const username = useAppStore((state) => state.username);
  const location = useAppStore((state) => state.location);
  const peers = useAppStore((state) => state.peers);
  const trip = useAppStore((state) => state.trip);
  const ws = useAppStore((state) => state.ws);
  const chatMessages = useAppStore((state) => state.chatMessages);
  const setChatMessages = useAppStore((state) => state.setChatMessages);
  const appendChatMessage = useAppStore((state) => state.appendChatMessage);

  const [draft, setDraft] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const loadedGroupRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const onlineMembers = useMemo(() => {
    const members = new Map<string, { id: string; name: string; online: boolean; lastSeen: number }>();

    members.set(username, {
      id: username,
      name: username,
      online: Boolean(location),
      lastSeen: location?.timestamp || Date.now(),
    });

    trip?.participants.forEach((participant) => {
      const peer = peers[participant];
      const isOnline = participant === username || Boolean(peer && Date.now() - peer.timestamp < 60000);
      members.set(participant, {
        id: participant,
        name: participant,
        online: isOnline,
        lastSeen: participant === username ? (location?.timestamp || Date.now()) : (peer?.timestamp || Date.now()),
      });
    });

    Object.values(peers).forEach((peer) => {
      const isOnline = Date.now() - peer.timestamp < 60000;
      members.set(peer.userID, {
        id: peer.userID,
        name: peer.name,
        online: isOnline,
        lastSeen: peer.timestamp,
      });
    });

    return [...members.values()].sort((left, right) => Number(right.online) - Number(left.online) || left.name.localeCompare(right.name));
  }, [location, peers, trip?.participants, username, tick]);

  useEffect(() => {
    if (!groupId || !token || loadedGroupRef.current === groupId) return;

    let cancelled = false;
    setLoadingHistory(true);

    fetchGroupChatHistory(groupId, token)
      .then((messages) => {
        if (cancelled) return;
        setChatMessages(messages);
        loadedGroupRef.current = groupId;
      })
      .catch(() => {
        if (!cancelled) {
          loadedGroupRef.current = groupId;
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId, token, setChatMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages.length, isOpen]);

  const canSend = Boolean(draft.trim()) && ws?.readyState === WebSocket.OPEN && !isUploading;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !groupId) return;

    setUploadError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/chat/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to upload image");
      }

      const data = await response.json();
      const mediaURL = data.url;

      const caption = draft.trim();
      const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic = normalizeChatMessage({
        messageID: clientMessageId,
        clientMessageId,
        groupID: groupId,
        userID: username,
        username,
        text: caption,
        mediaURL,
        timestamp: Date.now(),
        kind: "image",
        status: "sending",
      });

      if (optimistic) {
        appendChatMessage(optimistic);
      }

      sendWsMessage("chat_message", {
        clientMessageId,
        text: caption,
        mediaURL,
        kind: "image",
      });

      setDraft("");
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !groupId) return;

    const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic = normalizeChatMessage({
      messageID: clientMessageId,
      clientMessageId,
      groupID: groupId,
      userID: username,
      username,
      text,
      timestamp: Date.now(),
      kind: "text",
      status: "sending",
    });

    if (optimistic) {
      appendChatMessage(optimistic);
    }

    sendWsMessage("chat_message", {
      clientMessageId,
      text,
      kind: "text",
    });

    setDraft("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.22 }}
          className="chat-panel"
        >
          <div className="chat-panel-header">
            <div className="chat-panel-title">
              <div className="chat-panel-kicker">
                <MessageSquare size={14} />
                <span>Group Chat</span>
              </div>
              <div className="chat-panel-meta">
                <span>{groupId || "No room selected"}</span>
                <span className="chat-panel-sep">•</span>
                <span>{onlineMembers.length} members</span>
              </div>
            </div>
            <button className="chat-panel-close" type="button" onClick={onToggle} aria-label="Collapse chat panel">
              <ChevronDown size={14} />
            </button>
          </div>

          <div className="chat-panel-body">
            {loadingHistory && chatMessages.length === 0 && (
              <div className="chat-empty-state">
                <div className="chat-empty-logo" aria-hidden="true">
                  <span className="chat-empty-ring" />
                  <MessageSquare size={16} />
                </div>
                <span>Loading room history...</span>
              </div>
            )}

            {!loadingHistory && chatMessages.length === 0 && (
              <div className="chat-empty-state">
                <div className="chat-empty-logo" aria-hidden="true">
                  <span className="chat-empty-ring" />
                  <MessageSquare size={16} />
                </div>
                <div>
                  <strong>No messages yet</strong>
                  <p>Say hello to the group and start the conversation.</p>
                </div>
              </div>
            )}

            {chatMessages.map((message: ChatMessage) => {
              const isSelf = message.userID === username;

              if (message.kind === "system") {
                return (
                  <div key={chatMessageKey(message)} className="chat-system-message">
                    <span>{message.text}</span>
                  </div>
                );
              }

              return (
                <div
                  key={chatMessageKey(message)}
                  className={`chat-message-row ${isSelf ? "self" : "peer"}`}
                >
                  <div className="chat-message-card">
                    <div className="chat-message-head">
                      <span className="chat-message-author">{isSelf ? "You" : message.username}</span>
                      <span className="chat-message-time">{formatTime(message.timestamp)}</span>
                    </div>
                    {message.kind === "image" && message.mediaURL && (
                      <div className="chat-message-image-container">
                        <img
                          src={message.mediaURL}
                          alt="Uploaded content"
                          className="chat-message-image"
                          onClick={() => setActiveLightboxImage(message.mediaURL || null)}
                        />
                      </div>
                    )}
                    {message.text && <p className="chat-message-text">{message.text}</p>}
                    {isSelf && (
                      <div className="chat-message-foot">
                        <span className={`chat-message-status ${message.status === "sending" ? "sending" : "sent"}`}>
                          {message.status === "sending" ? "Sending" : "Sent"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-composer">
            <textarea
              className="chat-input"
              rows={2}
              placeholder={
                ws?.readyState === WebSocket.OPEN
                  ? isUploading
                    ? "Uploading image..."
                    : "Write a message to the group..."
                  : "Connecting to chat..."
              }
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (canSend) handleSend();
                }
              }}
              disabled={ws?.readyState !== WebSocket.OPEN || isUploading}
            />
            <div className="chat-composer-footer">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept="image/*"
                onChange={handleFileChange}
                disabled={ws?.readyState !== WebSocket.OPEN || isUploading}
              />
              {uploadError && (
                <span className="chat-upload-error">
                  {uploadError}
                </span>
              )}
              {isUploading && (
                <span className="chat-upload-status">
                  Uploading...
                </span>
              )}
              <button
                className="chat-attach-btn"
                type="button"
                onClick={handleUploadClick}
                disabled={ws?.readyState !== WebSocket.OPEN || isUploading}
                title="Upload image"
              >
                <Image size={14} />
              </button>
              <button className="chat-send-btn" type="button" onClick={handleSend} disabled={!canSend || isUploading}>
                <Send size={14} />
                Send
              </button>
            </div>
          </div>
        </motion.aside>
      )}
      {/* Lightbox Modal */}
      <AnimatePresence>
        {activeLightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="chat-lightbox-backdrop"
            onClick={() => setActiveLightboxImage(null)}
          >
            <button
              className="chat-lightbox-close"
              onClick={() => setActiveLightboxImage(null)}
              aria-label="Close image preview"
            >
              <X size={20} />
            </button>
            <motion.img
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              src={activeLightboxImage}
              alt="Preview"
              className="chat-lightbox-img"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}

export default GroupChatPanel;
