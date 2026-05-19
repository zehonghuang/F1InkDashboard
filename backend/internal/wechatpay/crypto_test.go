package wechatpay

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"testing"
)

func TestSignAndVerifyRSASHA256(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	msg := "hello\nworld\n"

	sig, err := signRSASHA256(key, msg)
	if err != nil {
		t.Fatal(err)
	}
	if err := verifyRSASHA256(&key.PublicKey, msg, sig); err != nil {
		t.Fatal(err)
	}
}

func TestParseRSAPrivateKeyFromPEM_PKCS1AndPKCS8(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	pkcs1 := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	if _, err := parseRSAPrivateKeyFromPEM(pkcs1); err != nil {
		t.Fatalf("pkcs1: %v", err)
	}

	pkcs8Bytes, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	pkcs8 := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: pkcs8Bytes})
	if _, err := parseRSAPrivateKeyFromPEM(pkcs8); err != nil {
		t.Fatalf("pkcs8: %v", err)
	}
}

func TestDecryptAES256GCM(t *testing.T) {
	key := make([]byte, 32)
	nonce := make([]byte, 12)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	if _, err := rand.Read(nonce); err != nil {
		t.Fatal(err)
	}
	aad := []byte("aad")
	plain := []byte(`{"foo":"bar"}`)

	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	ct := gcm.Seal(nil, nonce, plain, aad)
	enc := base64.StdEncoding.EncodeToString(ct)

	got, err := decryptAES256GCM(string(key), EncryptedResource{
		Ciphertext:     enc,
		Nonce:          string(nonce),
		AssociatedData: string(aad),
	})
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(plain) {
		t.Fatalf("unexpected plaintext: %s", string(got))
	}
}
