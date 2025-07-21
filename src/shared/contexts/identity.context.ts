// IMPORTANT: You MUST paste the actual JSON-LD content from http://w3id.org/identity/v1 here.
// Go to http://w3id.org/identity/v1 in a browser, copy the raw JSON, and paste it below.
export const JSON_LD_IDENTITY_CONTEXT_CACHE = JSON.parse(`
{
  "@context": {
    "Credential": {
      "@id": "https://w3id.org/credentials#Credential"
    },
    "CryptographicKey": {
      "@id": "https://w3id.org/security#Key"
    },
    "CryptographicKeyCredential": {
      "@id": "https://w3id.org/credentials#CryptographicKeyCredential"
    },
    "EncryptedMessage": {
      "@id": "https://w3id.org/security#EncryptedMessage"
    },
    "GraphSignature2012": {
      "@id": "https://w3id.org/security#GraphSignature2012"
    },
    "Group": {
      "@id": "https://www.w3.org/ns/activitystreams#Group"
    },
    "Identity": {
      "@id": "https://w3id.org/identity#Identity"
    },
    "LinkedDataSignature2015": {
      "@id": "https://w3id.org/security#LinkedDataSignature2015"
    },
    "Organization": {
      "@id": "http://schema.org/Organization"
    },
    "Person": {
      "@id": "http://schema.org/Person"
    },
    "PostalAddress": {
      "@id": "http://schema.org/PostalAddress"
    },
    "about": {
      "@id": "http://schema.org/about",
      "@type": "@id"
    },
    "accessControl": {
      "@id": "https://w3id.org/permissions#accessControl",
      "@type": "@id"
    },
    "address": {
      "@id": "http://schema.org/address",
      "@type": "@id"
    },
    "addressCountry": {
      "@id": "http://schema.org/addressCountry"
    },
    "addressLocality": {
      "@id": "http://schema.org/addressLocality"
    },
    "addressRegion": {
      "@id": "http://schema.org/addressRegion"
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
    "claim": {
      "@id": "https://w3id.org/credentials#claim",
      "@type": "@id"
    },
    "comment": {
      "@id": "http://www.w3.org/2000/01/rdf-schema#comment"
    },
    "created": {
      "@id": "http://purl.org/dc/terms/created",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime"
    },
    "creator": {
      "@id": "http://purl.org/dc/terms/creator",
      "@type": "@id"
    },
    "cred": {
      "@id": "https://w3id.org/credentials#",
      "@prefix": true
    },
    "credential": {
      "@id": "https://w3id.org/credentials#credential",
      "@type": "@id"
    },
    "dc": {
      "@id": "http://purl.org/dc/terms/",
      "@prefix": true
    },
    "description": {
      "@id": "http://schema.org/description"
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
    "email": {
      "@id": "http://schema.org/email"
    },
    "expires": {
      "@id": "https://w3id.org/security#expiration",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime"
    },
    "familyName": {
      "@id": "http://schema.org/familyName"
    },
    "givenName": {
      "@id": "http://schema.org/givenName"
    },
    "id": "@id",
    "identity": {
      "@id": "https://w3id.org/identity#",
      "@prefix": true
    },
    "identityService": {
      "@id": "https://w3id.org/identity#identityService",
      "@type": "@id"
    },
    "idp": {
      "@id": "https://w3id.org/identity#idp",
      "@type": "@id"
    },
    "image": {
      "@id": "http://schema.org/image",
      "@type": "@id"
    },
    "initializationVector": {
      "@id": "https://w3id.org/security#initializationVector"
    },
    "issued": {
      "@id": "https://w3id.org/credentials#issued",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime"
    },
    "issuer": {
      "@id": "https://w3id.org/credentials#issuer",
      "@type": "@id"
    },
    "label": {
      "@id": "http://www.w3.org/2000/01/rdf-schema#label"
    },
    "member": {
      "@id": "http://schema.org/member",
      "@type": "@id"
    },
    "memberOf": {
      "@id": "http://schema.org/memberOf",
      "@type": "@id"
    },
    "name": {
      "@id": "http://schema.org/name"
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
    "paymentProcessor": {
      "@id": "https://w3id.org/payswarm#processor"
    },
    "perm": {
      "@id": "https://w3id.org/permissions#",
      "@prefix": true
    },
    "postalCode": {
      "@id": "http://schema.org/postalCode"
    },
    "preferences": {
      "@id": "https://w3id.org/payswarm#preferences",
      "@type": "@vocab"
    },
    "privateKey": {
      "@id": "https://w3id.org/security#privateKey",
      "@type": "@id"
    },
    "privateKeyPem": {
      "@id": "https://w3id.org/security#privateKeyPem"
    },
    "ps": {
      "@id": "https://w3id.org/payswarm#",
      "@prefix": true
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
    "rdf": {
      "@id": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      "@prefix": true
    },
    "rdfs": {
      "@id": "http://www.w3.org/2000/01/rdf-schema#",
      "@prefix": true
    },
    "recipient": {
      "@id": "https://w3id.org/credentials#recipient",
      "@type": "@id"
    },
    "revoked": {
      "@id": "https://w3id.org/security#revoked",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime"
    },
    "schema": {
      "@id": "http://schema.org/",
      "@prefix": true
    },
    "sec": {
      "@id": "https://w3id.org/security#",
      "@prefix": true
    },
    "signature": {
      "@id": "https://w3id.org/security#signature"
    },
    "signatureAlgorithm": {
      "@id": "https://w3id.org/security#signatureAlgorithm"
    },
    "signatureValue": {
      "@id": "https://w3id.org/security#signatureValue"
    },
    "streetAddress": {
      "@id": "http://schema.org/streetAddress"
    },
    "title": {
      "@id": "http://purl.org/dc/terms/title"
    },
    "type": "@type",
    "url": {
      "@id": "http://schema.org/url",
      "@type": "@id"
    },
    "writePermission": {
      "@id": "https://w3id.org/permissions#writePermission",
      "@type": "@id"
    },
    "xsd": {
      "@id": "http://www.w3.org/2001/XMLSchema#",
      "@prefix": true
    }
  }
}
`);
