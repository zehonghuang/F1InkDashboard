package wechatpay

import (
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"strings"
)

// Wechat Pay V3 的回调通知 resource 使用 AES-256-GCM 加密：
// - key: 商户 APIv3Key（32字节）
// - nonce: 回调 resource.nonce（12字节字符串）
// - aad: 回调 resource.associated_data（可空）
// - ciphertext: base64(密文|tag)，tag 长度 16 字节
type EncryptedResource struct {
	Ciphertext     string `json:"ciphertext"`
	Nonce          string `json:"nonce"`
	AssociatedData string `json:"associated_data"`
}

func randHex(nBytes int) string {
	if nBytes < 1 {
		nBytes = 1
	}
	b := make([]byte, nBytes)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func signRSASHA256(key *rsa.PrivateKey, msg string) (string, error) {
	h := sha256.Sum256([]byte(msg))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, h[:])
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(sig), nil
}

func verifyRSASHA256(pub *rsa.PublicKey, msg string, signatureBase64 string) error {
	sig, err := base64.StdEncoding.DecodeString(signatureBase64)
	if err != nil {
		return err
	}
	h := sha256.Sum256([]byte(msg))
	return rsa.VerifyPKCS1v15(pub, crypto.SHA256, h[:], sig)
}

func decryptAES256GCM(apiV3Key string, r EncryptedResource) ([]byte, error) {
	key := []byte(strings.TrimSpace(apiV3Key))
	if len(key) != 32 {
		return nil, errors.New("invalid_apiv3_key_length")
	}
	nonce := []byte(r.Nonce)
	if len(nonce) != 12 {
		return nil, errors.New("invalid_resource_nonce_length")
	}
	ct, err := base64.StdEncoding.DecodeString(r.Ciphertext)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plain, err := gcm.Open(nil, nonce, ct, []byte(r.AssociatedData))
	if err != nil {
		return nil, err
	}
	return plain, nil
}

func parseRSAPrivateKeyFromPEM(pemBytes []byte) (*rsa.PrivateKey, error) {
	var b *pem.Block
	for {
		b, pemBytes = pem.Decode(pemBytes)
		if b == nil {
			break
		}
		switch strings.TrimSpace(b.Type) {
		case "PRIVATE KEY":
			k, err := x509.ParsePKCS8PrivateKey(b.Bytes)
			if err != nil {
				return nil, err
			}
			rsaKey, ok := k.(*rsa.PrivateKey)
			if !ok {
				return nil, errors.New("private_key_not_rsa")
			}
			return rsaKey, nil
		case "RSA PRIVATE KEY":
			return x509.ParsePKCS1PrivateKey(b.Bytes)
		}
	}
	return nil, errors.New("private_key_not_found")
}

func parseX509CertificatesFromPEM(pemBytes []byte) (map[string]*x509.Certificate, error) {
	out := map[string]*x509.Certificate{}
	var b *pem.Block
	for {
		b, pemBytes = pem.Decode(pemBytes)
		if b == nil {
			break
		}
		if strings.TrimSpace(b.Type) != "CERTIFICATE" {
			continue
		}
		cert, err := x509.ParseCertificate(b.Bytes)
		if err != nil {
			return nil, err
		}
		out[certSerialHex(cert.SerialNumber)] = cert
	}
	if len(out) == 0 {
		return nil, errors.New("platform_cert_not_found")
	}
	return out, nil
}

func certSerialHex(n *big.Int) string {
	if n == nil {
		return ""
	}
	return strings.ToUpper(fmt.Sprintf("%X", n))
}
