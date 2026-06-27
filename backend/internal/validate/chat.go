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
	msg.MediaURL = strings.TrimSpace(msg.MediaURL)
	if msg.Kind == "" {
		msg.Kind = model.ChatKindText
	}

	if msg.Kind != model.ChatKindText && msg.Kind != model.ChatKindImage {
		return errors.New("unsupported chat kind")
	}

	if msg.Kind == model.ChatKindText {
		if msg.Text == "" {
			return errors.New("text is required")
		}
		if len(msg.Text) > MaxChatTextLength {
			return errors.New("text exceeds max length")
		}
	} else if msg.Kind == model.ChatKindImage {
		if msg.MediaURL == "" {
			return errors.New("mediaURL is required for image kind")
		}
		if len(msg.MediaURL) > 2048 {
			return errors.New("mediaURL exceeds max length")
		}
		if msg.Text != "" && len(msg.Text) > MaxChatTextLength {
			return errors.New("caption exceeds max length")
		}
	}

	if len(msg.ClientMessageID) > MaxClientMessageIDLen {
		return errors.New("client_message_id exceeds max length")
	}
	if msg.RecipientID != "" {
		if len(msg.RecipientID) > 64 {
			return errors.New("recipientID exceeds max length")
		}
		if msg.RecipientID == msg.UserID {
			return errors.New("cannot send private message to yourself")
		}
	}
	return nil
}
