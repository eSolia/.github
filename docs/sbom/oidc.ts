// GitHub Actions OIDC token verification
//
// InfoSec: This is the zero-static-secrets auth path. GitHub Actions
// requests a short-lived JWT from its OIDC provider, scoped to our
// audience. We verify it against GitHub's JWKS endpoint. No API keys,
// no shared secrets, no rotation headaches.

import type { GitHubOidcClaims } from './types';

/** JWKS key with the key-ID extension (standard JsonWebKey omits kid). */
interface JwkWithKid extends JsonWebKey {
  kid: string;
}

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;

// InfoSec: Clock skew tolerance for nbf/exp validation (seconds).
// 30s is conservative — GitHub Actions tokens are typically used within seconds.
const CLOCK_SKEW_SECONDS = 30;

/** Cached JWKS keys — refreshed if verification fails */
let jwksCache: JwkWithKid[] | null = null;
let jwksCacheExpiry = 0;

/**
 * Verify a GitHub Actions OIDC JWT and return the decoded claims.
 *
 * @throws {Error} If the token is invalid, expired, or from the wrong org
 */
export async function verifyGitHubOidc(
  token: string,
  expectedAudience: string,
  expectedOrg: string
): Promise<GitHubOidcClaims> {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error('Malformed JWT: expected 3 parts');
  }

  // InfoSec: Decode header to get key ID — must use base64url, not plain base64.
  // JWTs use base64url encoding (RFC 7515 §2), which replaces +→- and /→_.
  const header = JSON.parse(base64UrlDecode(headerB64)) as { kid: string; alg: string };
  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  // Fetch and cache JWKS
  const jwks = await getJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Key not found — force refresh in case GitHub rotated keys
    jwksCache = null;
    const refreshedJwks = await getJwks();
    const refreshedJwk = refreshedJwks.find((k) => k.kid === header.kid);
    if (!refreshedJwk) {
      throw new Error(`Unknown key ID: ${header.kid}`);
    }
    await verifySignature(refreshedJwk, headerB64, payloadB64, signatureB64);
  } else {
    await verifySignature(jwk, headerB64, payloadB64, signatureB64);
  }

  // Decode and validate claims
  const claims = JSON.parse(base64UrlDecode(payloadB64)) as GitHubOidcClaims;

  // InfoSec: Validate issuer — prevents tokens from other OIDC providers
  if (claims.iss !== GITHUB_OIDC_ISSUER) {
    throw new Error(`Invalid issuer: ${claims.iss}`);
  }

  // InfoSec: Validate audience — prevents tokens meant for other services
  if (claims.aud !== expectedAudience) {
    throw new Error(`Invalid audience: ${claims.aud}`);
  }

  // InfoSec: Validate org — only accept tokens from our GitHub org
  if (claims.repository_owner !== expectedOrg) {
    throw new Error(`Invalid org: ${claims.repository_owner}`);
  }

  // InfoSec: Validate temporal claims
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now - CLOCK_SKEW_SECONDS) {
    throw new Error('Token expired');
  }

  // InfoSec: Validate not-before — prevents accepting tokens before their validity window
  if (claims.nbf !== undefined && claims.nbf > now + CLOCK_SKEW_SECONDS) {
    throw new Error('Token not yet valid');
  }

  return claims;
}

async function getJwks(): Promise<JwkWithKid[]> {
  const now = Date.now();
  if (jwksCache && jwksCacheExpiry > now) {
    return jwksCache;
  }

  const response = await fetch(GITHUB_JWKS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const data = (await response.json()) as { keys: JwkWithKid[] };
  jwksCache = data.keys;
  jwksCacheExpiry = now + 60 * 60 * 1000; // Cache for 1 hour
  return data.keys;
}

async function verifySignature(
  jwk: JsonWebKey,
  headerB64: string,
  payloadB64: string,
  signatureB64: string
): Promise<void> {
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  // JWT signatures use base64url encoding
  const signature = base64UrlToArrayBuffer(signatureB64);

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);

  if (!valid) {
    throw new Error('Invalid JWT signature');
  }
}

/** Decode a base64url string to a UTF-8 string (for JWT header/payload). */
function base64UrlDecode(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

/** Decode a base64url string to an ArrayBuffer (for JWT signature verification). */
function base64UrlToArrayBuffer(b64url: string): ArrayBuffer {
  const binary = base64UrlDecode(b64url);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
