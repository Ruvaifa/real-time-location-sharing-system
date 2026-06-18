package validate

import (
	"errors"
	"strings"

	"location-sharing-backend/internal/model"
)

const (
	MaxChatTextLength     = 2000
	MaxClientMessageIDLen = 128
)

// ChatMessage validates and normalizes a user-sent chat message.
func ChatMessage(msg *model.ChatMessage) error {
	msg.Text = strings.TrimSpace(msg.Text)
	if msg.Kind == "" {
		msg.Kind = model.ChatKindText
	}

	if msg.Kind != model.ChatKindText {
		return errors.New("unsupported chat kind")
	}
	if msg.Text == "" {
		return errors.New("text is required")
	}
	if len(msg.Text) > MaxChatTextLength {
		return errors.New("text exceeds max length")
	}
	if len(msg.ClientMessageID) > MaxClientMessageIDLen {
		return errors.New("client_message_id exceeds max length")
	}
	return nil
}
