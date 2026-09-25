// Lookup tables for the Certificate Decoder: the object identifiers an X.509
// certificate, CSR or public key actually uses, mapped to readable names.
// Anything missing here still decodes — it just shows its dotted OID.

window.CERT_DATA = Object.freeze({
  // Distinguished-name attributes. `short` is the RFC 4514 / OpenSSL label.
  NAME_ATTRS: {
    "2.5.4.3": { short: "CN", label: "Common name" },
    "2.5.4.4": { short: "SN", label: "Surname" },
    "2.5.4.5": { short: "serialNumber", label: "Serial number" },
    "2.5.4.6": { short: "C", label: "Country" },
    "2.5.4.7": { short: "L", label: "Locality" },
    "2.5.4.8": { short: "ST", label: "State / province" },
    "2.5.4.9": { short: "street", label: "Street" },
    "2.5.4.10": { short: "O", label: "Organization" },
    "2.5.4.11": { short: "OU", label: "Organizational unit" },
    "2.5.4.12": { short: "title", label: "Title" },
    "2.5.4.15": { short: "businessCategory", label: "Business category" },
    "2.5.4.17": { short: "postalCode", label: "Postal code" },
    "2.5.4.42": { short: "GN", label: "Given name" },
    "2.5.4.97": { short: "organizationIdentifier", label: "Organization identifier" },
    "1.2.840.113549.1.9.1": { short: "emailAddress", label: "Email address" },
    "0.9.2342.19200300.100.1.1": { short: "UID", label: "User ID" },
    "0.9.2342.19200300.100.1.25": { short: "DC", label: "Domain component" },
    "1.3.6.1.4.1.311.60.2.1.1": { short: "jurisdictionL", label: "Jurisdiction locality" },
    "1.3.6.1.4.1.311.60.2.1.2": { short: "jurisdictionST", label: "Jurisdiction state" },
    "1.3.6.1.4.1.311.60.2.1.3": { short: "jurisdictionC", label: "Jurisdiction country" },
  },

  // Signature algorithms. `hash` and `family` drive WebCrypto verification;
  // `weak` flags digests that no public CA may sign with any more.
  SIG_ALGS: {
    "1.2.840.113549.1.1.4": { name: "md5WithRSAEncryption", family: "RSA", hash: "MD5", weak: true },
    "1.2.840.113549.1.1.5": { name: "sha1WithRSAEncryption", family: "RSA", hash: "SHA-1", weak: true },
    "1.2.840.113549.1.1.10": { name: "RSASSA-PSS", family: "RSA-PSS" },
    "1.2.840.113549.1.1.11": { name: "sha256WithRSAEncryption", family: "RSA", hash: "SHA-256" },
    "1.2.840.113549.1.1.12": { name: "sha384WithRSAEncryption", family: "RSA", hash: "SHA-384" },
    "1.2.840.113549.1.1.13": { name: "sha512WithRSAEncryption", family: "RSA", hash: "SHA-512" },
    "1.2.840.113549.1.1.14": { name: "sha224WithRSAEncryption", family: "RSA", hash: "SHA-224" },
    "1.2.840.10045.4.1": { name: "ecdsa-with-SHA1", family: "ECDSA", hash: "SHA-1", weak: true },
    "1.2.840.10045.4.3.2": { name: "ecdsa-with-SHA256", family: "ECDSA", hash: "SHA-256" },
    "1.2.840.10045.4.3.3": { name: "ecdsa-with-SHA384", family: "ECDSA", hash: "SHA-384" },
    "1.2.840.10045.4.3.4": { name: "ecdsa-with-SHA512", family: "ECDSA", hash: "SHA-512" },
    "1.2.840.10040.4.3": { name: "dsa-with-SHA1", family: "DSA", hash: "SHA-1", weak: true },
    "2.16.840.1.101.3.4.3.2": { name: "dsa-with-SHA256", family: "DSA", hash: "SHA-256" },
    "1.3.101.112": { name: "Ed25519", family: "Ed25519" },
    "1.3.101.113": { name: "Ed448", family: "Ed448" },
    "2.16.840.1.101.3.4.3.17": { name: "ML-DSA-44", family: "ML-DSA" },
    "2.16.840.1.101.3.4.3.18": { name: "ML-DSA-65", family: "ML-DSA" },
    "2.16.840.1.101.3.4.3.19": { name: "ML-DSA-87", family: "ML-DSA" },
  },

  // Public-key algorithms (the SubjectPublicKeyInfo algorithm identifier).
  KEY_ALGS: {
    "1.2.840.113549.1.1.1": { name: "RSA", kind: "rsa" },
    "1.2.840.113549.1.1.10": { name: "RSA-PSS", kind: "rsa" },
    "1.2.840.10045.2.1": { name: "EC", kind: "ec" },
    "1.2.840.10040.4.1": { name: "DSA", kind: "dsa" },
    "1.3.101.110": { name: "X25519", kind: "okp", bits: 256 },
    "1.3.101.111": { name: "X448", kind: "okp", bits: 448 },
    "1.3.101.112": { name: "Ed25519", kind: "okp", bits: 256 },
    "1.3.101.113": { name: "Ed448", kind: "okp", bits: 456 },
    "2.16.840.1.101.3.4.3.17": { name: "ML-DSA-44", kind: "pq" },
    "2.16.840.1.101.3.4.3.18": { name: "ML-DSA-65", kind: "pq" },
    "2.16.840.1.101.3.4.3.19": { name: "ML-DSA-87", kind: "pq" },
    "2.16.840.1.101.3.4.4.1": { name: "ML-KEM-512", kind: "pq" },
    "2.16.840.1.101.3.4.4.2": { name: "ML-KEM-768", kind: "pq" },
    "2.16.840.1.101.3.4.4.3": { name: "ML-KEM-1024", kind: "pq" },
  },

  // Named curves. `webcrypto` is the namedCurve WebCrypto accepts, if any.
  CURVES: {
    "1.2.840.10045.3.1.7": { name: "P-256", bits: 256, webcrypto: "P-256" },
    "1.3.132.0.34": { name: "P-384", bits: 384, webcrypto: "P-384" },
    "1.3.132.0.35": { name: "P-521", bits: 521, webcrypto: "P-521" },
    "1.3.132.0.10": { name: "secp256k1", bits: 256 },
    "1.2.840.10045.3.1.1": { name: "P-192", bits: 192 },
    "1.3.132.0.33": { name: "P-224", bits: 224 },
    "1.3.36.3.3.2.8.1.1.7": { name: "brainpoolP256r1", bits: 256 },
    "1.3.36.3.3.2.8.1.1.11": { name: "brainpoolP384r1", bits: 384 },
    "1.3.36.3.3.2.8.1.1.13": { name: "brainpoolP512r1", bits: 512 },
  },

  EXTENSIONS: {
    "2.5.29.14": "Subject key identifier",
    "2.5.29.15": "Key usage",
    "2.5.29.17": "Subject alternative name",
    "2.5.29.18": "Issuer alternative name",
    "2.5.29.19": "Basic constraints",
    "2.5.29.30": "Name constraints",
    "2.5.29.31": "CRL distribution points",
    "2.5.29.32": "Certificate policies",
    "2.5.29.35": "Authority key identifier",
    "2.5.29.36": "Policy constraints",
    "2.5.29.37": "Extended key usage",
    "2.5.29.54": "Inhibit anyPolicy",
    "1.3.6.1.5.5.7.1.1": "Authority information access",
    "1.3.6.1.5.5.7.1.11": "Subject information access",
    "1.3.6.1.5.5.7.1.24": "TLS feature",
    "1.3.6.1.4.1.11129.2.4.2": "Signed certificate timestamps",
    "1.3.6.1.4.1.11129.2.4.3": "Precertificate poison",
    "1.3.6.1.5.5.7.48.1.5": "OCSP no check",
    "2.16.840.1.113730.1.1": "Netscape certificate type",
    "2.16.840.1.113730.1.13": "Netscape comment",
    "1.3.6.1.4.1.311.21.7": "Microsoft certificate template",
    "1.3.6.1.4.1.311.21.10": "Microsoft application policies",
  },

  // Key usage bit positions, RFC 5280 §4.2.1.3.
  KEY_USAGE_BITS: [
    "Digital signature",
    "Non-repudiation",
    "Key encipherment",
    "Data encipherment",
    "Key agreement",
    "Certificate signing",
    "CRL signing",
    "Encipher only",
    "Decipher only",
  ],

  EXT_KEY_USAGES: {
    "1.3.6.1.5.5.7.3.1": "TLS server authentication",
    "1.3.6.1.5.5.7.3.2": "TLS client authentication",
    "1.3.6.1.5.5.7.3.3": "Code signing",
    "1.3.6.1.5.5.7.3.4": "Email protection",
    "1.3.6.1.5.5.7.3.8": "Time stamping",
    "1.3.6.1.5.5.7.3.9": "OCSP signing",
    "1.3.6.1.5.5.7.3.17": "IPsec IKE",
    "1.3.6.1.4.1.311.10.3.3": "Microsoft server gated crypto",
    "1.3.6.1.4.1.311.20.2.2": "Microsoft smart card logon",
    "2.16.840.1.113730.4.1": "Netscape server gated crypto",
    "2.5.29.37.0": "Any extended key usage",
  },

  POLICIES: {
    "2.5.29.32.0": "Any policy",
    "2.23.140.1.1": "Extended validation (EV)",
    "2.23.140.1.2.1": "Domain validated (DV)",
    "2.23.140.1.2.2": "Organization validated (OV)",
    "2.23.140.1.2.3": "Individual validated (IV)",
    "2.23.140.1.4.1": "Code signing",
    "2.23.140.1.5.1.1": "S/MIME mailbox validated",
    "1.3.6.1.4.1.44947.1.1.1": "ISRG domain validated",
  },

  ACCESS_METHODS: {
    "1.3.6.1.5.5.7.48.1": "OCSP",
    "1.3.6.1.5.5.7.48.2": "CA issuers",
    "1.3.6.1.5.5.7.48.3": "Time stamping",
    "1.3.6.1.5.5.7.48.5": "CA repository",
  },

  OTHER_NAMES: {
    "1.3.6.1.4.1.311.20.2.3": "UPN",
    "1.3.6.1.5.5.7.8.9": "SmtpUTF8Mailbox",
  },

  // A two-certificate chain: an OV-style RSA leaf signed by an ECDSA P-384
  // root. Generated for this tool with OpenSSL; the keys were discarded.
  SAMPLE_PEM: `-----BEGIN CERTIFICATE-----
MIIEIjCCA6mgAwIBAgIGChssPU5fMAoGCCqGSM49BAMCMEsxCzAJBgNVBAYTAlVT
MRkwFwYDVQQKDBBEZXZUb29scyBFeGFtcGxlMSEwHwYDVQQDDBhEZXZUb29scyBF
eGFtcGxlIFJvb3QgQ0EwHhcNMjYwMzAxMDAwMDAwWhcNMzUwMzAxMDAwMDAwWjBw
MQswCQYDVQQGEwJVUzETMBEGA1UECAwKQ2FsaWZvcm5pYTEWMBQGA1UEBwwNU2Fu
IEZyYW5jaXNjbzEZMBcGA1UECgwQRGV2VG9vbHMgRXhhbXBsZTEZMBcGA1UEAwwQ
ZGV2dG9vbHMuZXhhbXBsZTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
AKwf4En+ZU5VWveeOYy0PVCf+Y63e+ecbDJAR7lw5H3XZsVkCgfA558TTRwQvj4k
CJMJeNWptnky7fVbXYal7LdtOXE+sYzKwo4WfqYjr1Wgu9hMwiWcnuI1sBpdDusW
zUKaK/LL+aMoRD6uTMJawdsxCOaQyA6HImcgdGpr6ZhOyUHm7Y+DCoZ9BJkBqQNG
+wJwC7oTlNL7/9Gd6jIB3O5ug3hy1UYCFOTe5GVCOqAWCp0RWtLgHNM+S32iJbQE
kfDvRB9Lm/+W+QT5gFs1O/WrEuHtUEFn3hjgmdrYUxCftwX+uiwUZqVC5BRbRhI6
aLw1yTTt8tWLgqd72PbbtskCAwEAAaOCAYcwggGDME0GA1UdEQRGMESCEGRldnRv
b2xzLmV4YW1wbGWCEiouZGV2dG9vbHMuZXhhbXBsZYcEwAACCoEWYWRtaW5AZGV2
dG9vbHMuZXhhbXBsZTAMBgNVHRMBAf8EAjAAMA4GA1UdDwEB/wQEAwIFoDAdBgNV
HSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwHQYDVR0OBBYEFC9aLv8B+6WSjNiq
jJZdyGlSfRp+MB8GA1UdIwQYMBaAFPjT8qCS0acthNtj3GxpYwvDc1+zMDUGA1Ud
HwQuMCwwKqAooCaGJGh0dHA6Ly9jcmwuZGV2dG9vbHMuZXhhbXBsZS9yb290LmNy
bDBpBggrBgEFBQcBAQRdMFswKAYIKwYBBQUHMAGGHGh0dHA6Ly9vY3NwLmRldnRv
b2xzLmV4YW1wbGUwLwYIKwYBBQUHMAKGI2h0dHA6Ly9jYS5kZXZ0b29scy5leGFt
cGxlL3Jvb3QuY3J0MBMGA1UdIAQMMAowCAYGZ4EMAQICMAoGCCqGSM49BAMCA2cA
MGQCMHbj/grqAmNj3nV88ZGQ4Ow1FZs3v18CNKjJuDZMZJ01rVtWC8deV+CCSxVb
piZA9AIwNLtVbeX1jsHSrl6C58SNhGr/f399OALzahpyvcYh0Y9Jamr43+xhmSqa
vQ/UGwBV
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICPDCCAcGgAwIBAgIUOnnz1A+MqFb+BIb0Fst9LK5+vFIwCgYIKoZIzj0EAwIw
SzELMAkGA1UEBhMCVVMxGTAXBgNVBAoMEERldlRvb2xzIEV4YW1wbGUxITAfBgNV
BAMMGERldlRvb2xzIEV4YW1wbGUgUm9vdCBDQTAeFw0yNjAxMDEwMDAwMDBaFw0z
NjAxMDEwMDAwMDBaMEsxCzAJBgNVBAYTAlVTMRkwFwYDVQQKDBBEZXZUb29scyBF
eGFtcGxlMSEwHwYDVQQDDBhEZXZUb29scyBFeGFtcGxlIFJvb3QgQ0EwdjAQBgcq
hkjOPQIBBgUrgQQAIgNiAARBmejYVqvi1o8hPeBJm/jjOLL80GpjMSQKXPKvU35K
+ieHFq/R2K6z81JXkhYVaDRDy6eXeVwCq/WuM8QBLvgvo7DAp0rgot6LYTz2r8UO
K5ifKjAW4qaZmIeB4PkE8X6jZjBkMB0GA1UdDgQWBBT40/KgktGnLYTbY9xsaWML
w3NfszAfBgNVHSMEGDAWgBT40/KgktGnLYTbY9xsaWMLw3NfszASBgNVHRMBAf8E
CDAGAQH/AgEAMA4GA1UdDwEB/wQEAwIBBjAKBggqhkjOPQQDAgNpADBmAjEArRIQ
gEHBuHArscYcn93dNlTvuWH1ut0Y714x8XzYQ2PXfOUorEyL9d7PkkQ6jiE2AjEA
vXNhpE4C0dpNXY7nDG6jwTY1RyLA1xEfCAxWanlsOzP0Bh/WB9+E7+MRdKKwVSGm
-----END CERTIFICATE-----
`,
});
