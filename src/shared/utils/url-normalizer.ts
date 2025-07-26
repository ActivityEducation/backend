// src/shared/utils/url-normalizer.ts

/**
 * Normalizes a given URL string to ensure consistency, especially for ActivityPub IDs.
 * This function applies the following normalization rules:
 * - Removes trailing slashes.
 * - Converts scheme and host to lowercase.
 * - Decodes URL-encoded characters in the path (but not query/fragment).
 *
 * It aims to produce a canonical representation of a URI for comparison and storage.
 *
 * @param urlString The URL string to normalize.
 * @returns The normalized URL string.
 */
export function normalizeUrl(urlString: string): string {
  if (!urlString) {
    return urlString;
  }

  try {
    const url = new URL(urlString);

    // 1. Remove trailing slashes from the pathname
    // (e.g., https://example.com/path/ -> https://example.com/path)
    if (url.pathname.endsWith('/') && url.pathname.length > 1) {
      url.pathname = url.pathname.slice(0, -1);
    }

    // 2. Convert scheme and host to lowercase
    // (e.g., HTTPS://DOMAIN.COM -> https://domain.com)
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();

    // 3. Decode URL-encoded characters in the pathname for consistency.
    // This is important because %2F (/) and other characters might be encoded.
    // However, we only decode the path, not query or hash, as their encoding
    // can be significant for data integrity.
    url.pathname = decodeURIComponent(url.pathname);

    // Reconstruct the URL string
    // The URL object's toString() method automatically handles port, username/password etc.
    return url.toString();
  } catch (error) {
    // If the URL is malformed, log an error and return the original string
    // as it might be an invalid ActivityPub ID or a non-URL string.
    console.error(`Error normalizing URL "${urlString}": ${error.message}`);
    return urlString; // Return original if invalid to prevent breaking
  }
}
