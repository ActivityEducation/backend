// IMPORTANT: You MUST paste the actual JSON-LD content from http://w3id.org/security/v1 here.
// Go to http://w3id.org/security/v1 in a browser, copy the raw JSON, and paste it below.
export const JSON_LD_SECURITY_CONTEXT_CACHE = JSON.parse(`
{
  "@context": {
    "CryptographicKey": {
      "@id": "https://w3id.org/security#Key"
    },
    "EcdsaKoblitzSignature2016": {
      "@id": "https://w3id.org/security#EcdsaKoblitzSignature2016"
    },
    "EncryptedMessage": {
      "@id": "https://w3id.org/security#EncryptedMessage"
    },
    "GraphSignature2012": {
      "@id": "https://w3id.org/security#GraphSignature2012"
    },
    "LinkedDataSignature2015": {
      "@id": "https://w3id.org/security#LinkedDataSignature2015"
    },
    "LinkedDataSignature2016": {
      "@id": "https://w3id.org/security#LinkedDataSignature2016"
    },
    "authenticationTag": {
      "@id": "https://w3id.org/security#authenticationTag"
    },
    "canonicalizationAlgorithm": {
      "@id": "https://w3id.org/security#canonicalizationAlgorithm"
    },
    "cipherAlgorithm": {
      "@id": "https://w3id.org/security#cipherAlgorithm"
    },
    "cipherData": {
      "@id": "https://w3id.org/security#cipherData"
    },
    "cipherKey": {
      "@id": "https://w3id.org/security#cipherKey"
    },
    "created": {
      "@id": "http://purl.org/dc/terms/created",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime"
    },
    "creator": {
      "@id": "http://purl.org/dc/terms/creator",
      "@type": "@id"
    },
    "dc": {
      "@id": "http://purl.org/dc/terms/",
      "@prefix": true
    },
    "digestAlgorithm": {
      "@id": "https://w3id.org/security#digestAlgorithm"
    },
    "digestValue": {
      "@id": "https://w3id.org/security#digestValue"
    },
    "domain": {
      "@id": "https://w3id.org/security#domain"
    },
    "encryptionKey": {
      "@id": "https://w3id.org/security#encryptionKey"
    },
    "expiration": {
      "@id": "https://w3id.org/security#expiration",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime"
    },
    "expires": {
      "@id": "https://w3id.org/security#expiration",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime"
    },
    "id": "@id",
    "initializationVector": {
      "@id": "https://w3id.org/security#initializationVector"
    },
    "iterationCount": {
      "@id": "https://w3id.org/security#iterationCount"
    },
    "nonce": {
      "@id": "https://w3id.org/security#nonce"
    },
    "normalizationAlgorithm": {
      "@id": "https://w3id.org/security#normalizationAlgorithm"
    },
    "owner": {
      "@id": "https://w3id.org/security#owner",
      "@type": "@id"
    },
    "password": {
      "@id": "https://w3id.org/security#password"
    },
    "privateKey": {
      "@id": "https://w3id.org/security#privateKey",
      "@type": "@id"
    },
    "privateKeyPem": {
      "@id": "https://w3id.org/security#privateKeyPem"
    },
    "publicKey": {
      "@id": "https://w3id.org/security#publicKey",
      "@type": "@id"
    },
    "publicKeyPem": {
      "@id": "https://w3id.org/security#publicKeyPem"
    },
    "publicKeyService": {
      "@id": "https://w3id.org/security#publicKeyService",
      "@type": "@id"
    },
    "revoked": {
      "@id": "https://w3id.org/security#revoked",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime"
    },
    "salt": {
      "@id": "https://w3id.org/security#salt"
    },
    "sec": {
      "@id": "https://w3id.org/security#",
      "@prefix": true
    },
    "signature": {
      "@id": "https://w3id.org/security#signature"
    },
    "signatureAlgorithm": {
      "@id": "https://w3id.org/security#signingAlgorithm"
    },
    "signatureValue": {
      "@id": "https://w3id.org/security#signatureValue"
    },
    "type": "@type",
    "xsd": {
      "@id": "http://www.w3.org/2001/XMLSchema#",
      "@prefix": true
    }
  }
}
`);
