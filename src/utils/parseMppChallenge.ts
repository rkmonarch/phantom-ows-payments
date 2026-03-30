import type { X402PaymentRequired, X402PaymentAccept } from '../types';

/**
 * Fetch a resource URL. If the server returns HTTP 402, parse the
 * PAYMENT-REQUIRED header and return the structured challenge.
 *
 * Returns null if the request succeeds (no payment needed).
 * Throws on network errors or malformed 402 responses.
 */
export async function fetchWithX402(
  url: string,
  init?: RequestInit,
): Promise<{ response: Response; challenge: X402PaymentRequired | null }> {
  const response = await fetch(url, init);

  if (response.status !== 402) {
    return { response, challenge: null };
  }

  const headerValue =
    response.headers.get('PAYMENT-REQUIRED') ??
    response.headers.get('payment-required') ??
    response.headers.get('X-Payment-Required');

  if (!headerValue) {
    throw new Error('Server returned 402 but no PAYMENT-REQUIRED header found');
  }

  const challenge = decodeX402Header(headerValue);
  return { response, challenge };
}

/**
 * Retry a request after paying. Attaches the PAYMENT-SIGNATURE header.
 */
export async function retryWithPayment(
  url: string,
  paymentSignatureBase64: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'PAYMENT-SIGNATURE': paymentSignatureBase64,
    },
  });
}

/**
 * Decode a base64-encoded PAYMENT-REQUIRED header value into a typed object.
 */
export function decodeX402Header(headerValue: string): X402PaymentRequired {
  let jsonStr: string;
  try {
    jsonStr = atob(headerValue);
  } catch {
    // Maybe it wasn't base64 — try parsing directly
    jsonStr = headerValue;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse PAYMENT-REQUIRED header as JSON: ${jsonStr.slice(0, 100)}`);
  }

  return validateX402Challenge(parsed);
}

/**
 * Runtime validation + typing of a raw parsed challenge object.
 */
export function validateX402Challenge(raw: unknown): X402PaymentRequired {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('PAYMENT-REQUIRED payload must be an object');
  }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj['accepts']) || obj['accepts'].length === 0) {
    throw new Error('PAYMENT-REQUIRED must contain a non-empty "accepts" array');
  }

  return {
    x402Version: typeof obj['x402Version'] === 'number' ? obj['x402Version'] : 2,
    error: typeof obj['error'] === 'string' ? obj['error'] : undefined,
    resource: parseResource(obj['resource']),
    accepts: (obj['accepts'] as unknown[]).map(parseAccept),
    extensions: typeof obj['extensions'] === 'object' ? (obj['extensions'] as Record<string, unknown>) : undefined,
  };
}

function parseResource(raw: unknown): X402PaymentRequired['resource'] {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    url: String(obj['url'] ?? ''),
    description: typeof obj['description'] === 'string' ? obj['description'] : undefined,
    mimeType: typeof obj['mimeType'] === 'string' ? obj['mimeType'] : undefined,
  };
}

function parseAccept(raw: unknown): X402PaymentAccept {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Each item in "accepts" must be an object');
  }
  const obj = raw as Record<string, unknown>;

  return {
    scheme: String(obj['scheme'] ?? 'exact'),
    network: String(obj['network'] ?? ''),
    amount: String(obj['amount'] ?? '0'),
    asset: String(obj['asset'] ?? ''),
    payTo: String(obj['payTo'] ?? ''),
    maxTimeoutSeconds: typeof obj['maxTimeoutSeconds'] === 'number' ? obj['maxTimeoutSeconds'] : 60,
    feePayer: typeof obj['feePayer'] === 'string' ? obj['feePayer'] : undefined,
    memo: typeof obj['memo'] === 'string' ? obj['memo'] : undefined,
    extra: typeof obj['extra'] === 'object' ? (obj['extra'] as Record<string, unknown>) : undefined,
  };
}

/**
 * Pick the best payment option from a challenge based on preferred network.
 */
export function selectPaymentOption(
  challenge: X402PaymentRequired,
  preferredNetwork?: string,
): X402PaymentAccept {
  if (preferredNetwork) {
    const match = challenge.accepts.find((a) => a.network === preferredNetwork);
    if (match) return match;
  }

  // Prefer Solana (SVM) by default for Phantom
  const solana = challenge.accepts.find((a) => a.network.startsWith('solana'));
  if (solana) return solana;

  return challenge.accepts[0]!;
}

/**
 * Encode a payment payload as base64 for the PAYMENT-SIGNATURE header.
 */
export function encodePaymentSignature(payload: object): string {
  return btoa(JSON.stringify(payload));
}
