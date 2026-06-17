
Below is a simple requirements by frontend outlining the database schema, HTTP endpoints, and WebSocket behavior required.

## 1. Database Schema (Postgres Migration)

Create a new migration (e.g., `0004_create_chat_messages.up.sql`) to store group chat messages:

```sql
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,                       -- Server-generated UUID/hex ID
    group_id TEXT NOT NULL,                    -- The room/group ID
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,                    -- Sender display name
    text TEXT NOT NULL,                        -- Message content
    kind TEXT NOT NULL DEFAULT 'text',         -- Message type: 'text' or 'system'
    timestamp_ms BIGINT NOT NULL,              -- Millisecond unix timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX chat_messages_group_id_timestamp_idx ON chat_messages (group_id, timestamp_ms DESC);
```

---

## 2. HTTP REST Endpoints

### Fetch Chat History
The frontend calls this endpoint when a user opens the chat panel to fetch past messages.

* **Endpoint:** `GET /api/groups/{groupID}/messages`
* **Headers:** `Authorization: Bearer <JWT_TOKEN>`
  
  The frontend is resilient and accepts either a JSON array or an object wrapped in `items` or `messages` (fields can be camelCase or snake_case):

  ```json
  {
    "items": [
      {
        "messageID": "server-generated-id-1",
        "clientMessageId": "client-opt-id-1",
        "groupID": "room-abc",
        "userID": "user-123",
        "username": "Alice",
        "text": "Hey everyone!",
        "kind": "text",
        "timestamp": 1718678392000
      }
    ]
  }
  ```

* **Error Response:**
  ```json
  {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid token"
  }
  ```

---

## 3. WebSocket Integration

The real-time messaging uses the existing WebSocket connection established at `/ws/{groupID}`.

### Flow for Sending & Receiving Messages

1. **Client Sends Message:**
   When a user sends a message, the client transmits an envelope with `type: "chat_message"`:
   
   ```json
   {
     "type": "chat_message",
     "payload": {
       "clientMessageId": "client-1718678392000-xyz",
       "text": "Hello, world!",
       "kind": "text"
     }
   }
   ```

2. **Server Processes Message:**
   * **Trust the Token:** Use the verified `UserID` and `GroupID` from the WebSocket connection context (do not trust client-supplied sender values).
   * **Generate metadata:** Assign a unique `messageID` (e.g. UUID) and a server `timestamp` (Unix millisecond).
   * **Persist:** Save the message in the `chat_messages` table.
   * **Broadcast:** Broadcast the completed payload to **all** clients in the group (including the sender, so they receive confirmation of success).

3. **Server Broadcast Envelope (`chat_message`):**
   ```json
   {
     "type": "chat_message",
     "payload": {
       "messageID": "msg-8f92-abcde",
       "clientMessageId": "client-1718678392000-xyz",
       "groupID": "room-abc",
       "userID": "user-123",
       "username": "Alice",
       "text": "Hello, world!",
       "kind": "text",
       "timestamp": 1718678395000
     }
   }
   ```
   *Note: Echoing the `clientMessageId` back tells the sender's frontend to resolve its optimistic status from "Sending" to "Sent".*


