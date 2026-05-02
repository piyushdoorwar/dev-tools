# JWT Debugger

A standalone web-based JWT (JSON Web Token) debugger and editor inspired by DevUtils tools. Inspect, verify, and modify JWTs with support for multiple signing algorithms.

## Features

- **JWT Parsing**: Automatically decode and display header, payload, and signature components
- **Live Editing**: Edit header and payload JSON with real-time JWT updates
- **Signature Verification**: Verify JWT signatures using HMAC, RSA, and ECDSA algorithms
- **Token Signing**: Generate new signatures with your own keys
- **Algorithm Support**:
  - HS256 (HMAC SHA-256)
  - RS256 (RSA PKCS#1 SHA-256)
  - ES256 (ECDSA P-256 SHA-256)
- **Time Utilities**: Built-in timestamp editing with Unix/UTC/relative time conversion
- **Copy Functionality**: Easily copy headers, payloads, and keys
- **Error Handling**: Clear feedback for invalid tokens, keys, or operations

## Local Preview

1. Clone or download this repository
2. Open `index.html` in your web browser
3. Start debugging JWTs!

No server required - runs entirely in the browser using Web Crypto API.

## Usage

### Inspecting a JWT

1. Paste your JWT into the input field
2. The app automatically decodes and displays the header and payload
3. The signature status shows whether the token is valid

### Verifying Signatures

1. Select the appropriate algorithm from the dropdown
2. For HMAC: Enter the secret key
3. For RSA/ECDSA: Enter the public key in PEM format
4. Click "Verify" to check signature validity

### Signing Tokens

1. Edit the header and payload as needed
2. Select your desired algorithm
3. For HMAC: Enter the secret key
4. For RSA/ECDSA: Enter the private key in PEM format
5. Click "Apply" to generate a new signature

### Editing Timestamps

1. Click the eye icon next to the payload
2. Use the modal to edit timestamps in Unix, UTC, or relative formats
3. Click "Update" to apply changes

## Supported Key Formats

- **HMAC**: Plain text secret
- **RSA**: PEM format (`-----BEGIN PRIVATE KEY-----` or `-----BEGIN PUBLIC KEY-----`)
- **ECDSA**: PEM format (`-----BEGIN PRIVATE KEY-----` or `-----BEGIN PUBLIC KEY-----`)

## Browser Support

Requires a modern browser with Web Crypto API support (Chrome, Firefox, Safari, Edge).

## Security Note

This tool runs entirely in your browser and does not send any data to external servers. Keys and tokens remain local to your device.

## License

MIT License

