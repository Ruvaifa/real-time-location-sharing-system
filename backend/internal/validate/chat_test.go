package validate

import (
	"strings"
	"testing"

	"location-sharing-backend/internal/model"
)

func TestChatMessageValidation(t *testing.T) {
	tests := []struct {
		name     string
		msg      model.ChatMessage
		wantErr  bool
		wantTxt  string
		wantKind string
	}{
		{
			name:     "valid text is trimmed and default kind is text",
			msg:      model.ChatMessage{Text: "  hello  "},
			wantTxt:  "hello",
			wantKind: model.ChatKindText,
		},
		{
			name:    "empty text rejected",
			msg:     model.ChatMessage{Text: "  "},
			wantErr: true,
		},
		{
			name:    "long text rejected",
			msg:     model.ChatMessage{Text: strings.Repeat("a", MaxChatTextLength+1)},
			wantErr: true,
		},
		{
			name:    "unsupported kind rejected",
			msg:     model.ChatMessage{Text: "hello", Kind: model.ChatKindSystem},
			wantErr: true,
		},
		{
			name:    "long client message id rejected",
			msg:     model.ChatMessage{Text: "hello", ClientMessageID: strings.Repeat("a", MaxClientMessageIDLen+1)},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := tt.msg
			err := ChatMessage(&msg)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("expected nil error, got %v", err)
			}
			if msg.Text != tt.wantTxt {
				t.Fatalf("expected text %q, got %q", tt.wantTxt, msg.Text)
			}
			if msg.Kind != tt.wantKind {
				t.Fatalf("expected kind %q, got %q", tt.wantKind, msg.Kind)
			}
		})
	}
}
