package mailer

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

type GmailMailer struct {
	ClientID     string
	ClientSecret string
	RefreshToken string
	SenderEmail  string
}

func NewGmailMailer(clientID, clientSecret, refreshToken, senderEmail string) *GmailMailer {
	return &GmailMailer{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RefreshToken: refreshToken,
		SenderEmail:  senderEmail,
	}
}

// getAccessToken exchanges the refresh token for a short-lived access token.
func (m *GmailMailer) getAccessToken() (string, error) {
	data := url.Values{}
	data.Set("client_id", m.ClientID)
	data.Set("client_secret", m.ClientSecret)
	data.Set("refresh_token", m.RefreshToken)
	data.Set("grant_type", "refresh_token")

	resp, err := http.PostForm("https://oauth2.googleapis.com/token", data)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token exchange failed with status %d", resp.StatusCode)
	}

	var result struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.AccessToken, nil
}

// SendResetEmail sends a password reset email using the Gmail API.
func (m *GmailMailer) SendResetEmail(to, token string) error {
	accessToken, err := m.getAccessToken()
	if err != nil {
		return fmt.Errorf("failed to refresh access token: %w", err)
	}

	subject := "Reset Your Password - ParkQ Live"
	body := fmt.Sprintf(`
		<html>
		<body>
			<h2>Password Reset Request</h2>
			<p>We received a request to reset your password. Use the following code/token to reset your password:</p>
			<p style="font-size: 18px; font-weight: bold; background: #f0f0f0; padding: 10px; display: inline-block;">%s</p>
			<p>If you did not request this, you can ignore this email. This token is valid for 1 hour.</p>
		</body>
		</html>`, token)

	// Format RFC 2822 email headers and message
	rawMsg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=\"UTF-8\"\r\n\r\n%s",
		m.SenderEmail, to, subject, body)

	// Base64url encode without padding
	encodedMsg := base64.RawURLEncoding.EncodeToString([]byte(rawMsg))

	// Construct request body for Gmail API
	payload, err := json.Marshal(map[string]string{"raw": encodedMsg})
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", bytes.NewBuffer(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	apiResp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer apiResp.Body.Close()

	if apiResp.StatusCode != http.StatusOK {
		return fmt.Errorf("gmail api returned status %d", apiResp.StatusCode)
	}

	return nil
}
