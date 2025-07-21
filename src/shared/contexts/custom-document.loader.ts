import * as jsonld from 'jsonld';
import { JSON_LD_IDENTITY_CONTEXT_CACHE } from './identity.context';
import { JSON_LD_SECURITY_CONTEXT_CACHE } from './security.context';

// grab the built-in Node.js doc loader
const nodeDocumentLoader = jsonld.documentLoaders.node();
// or grab the XHR one: jsonld.documentLoaders.xhr()

// change the default document loader
const customDocumentLoader = (url: string, options) => {
  // Check if the requested URL is our cached security context
  switch (url) {
    case 'http://w3id.org/security/v1':
    case 'https://w3id.org/security/v1':
      return {
        contextUrl: null,
        document: JSON_LD_SECURITY_CONTEXT_CACHE,
        documentUrl: url,
      };
    case 'http://w3id.org/identity/v1':
    case 'https://w3id.org/identity/v1':
      return {
        contextUrl: null,
        document: JSON_LD_IDENTITY_CONTEXT_CACHE,
        documentUrl: url,
      }
    default:
      // Fallback to the default document loader for all other URLs
      // This is crucial for ActivityPub to fetch other contexts (like ActivityStreams)
      // or remote objects.
      return nodeDocumentLoader(url);
  }
};

jsonld.documentLoader = customDocumentLoader;

