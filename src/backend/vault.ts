/**
 * phantom-ows-payments — Backend Vault Pattern
 *
 * Copy this file into your Express/Node backend to create a minimal audit
 * trail for agent-initiated payments. The mobile client calls `logToVault()`
 * from owsCompliance.ts after each payment, posting to POST /api/payments.
 *
 * This is intentionally lightweight. In production you'd:
 *  - Add authentication (JWT / API key)
 *  - Persist to a real database
 *  - Add webhook support for downstream agents
 *  - Verify transaction signatures on-chain before confirming
 */

import type { PaymentRecord } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaultEntry {
  walletAddress: string;
  record: PaymentRecord;
  receivedAt: number;
}

// ─── In-memory store (replace with your DB) ───────────────────────────────────

const entries: VaultEntry[] = [];

// ─── Express route handlers ───────────────────────────────────────────────────

/**
 * POST /api/payments
 * Called by the mobile SDK after each payment attempt.
 */
export function handleLogPayment(
  req: { body: { record: PaymentRecord; walletAddress: string } },
  res: { status: (code: number) => { json: (body: unknown) => void } },
): void {
  const { record, walletAddress } = req.body;

  if (!record || !walletAddress) {
    res.status(400).json({ error: 'Missing record or walletAddress' });
    return;
  }

  const entry: VaultEntry = {
    walletAddress,
    record,
    receivedAt: Date.now(),
  };

  entries.push(entry);
  console.log(`[vault] Payment logged — wallet: ${walletAddress}, status: ${record.status}, tx: ${record.txHash ?? 'n/a'}`);

  res.status(201).json({ ok: true, id: record.id });
}

/**
 * GET /api/payments/:walletAddress
 * Retrieve payment history for a wallet.
 */
export function handleGetPayments(
  req: { params: { walletAddress: string } },
  res: { json: (body: unknown) => void },
): void {
  const { walletAddress } = req.params;
  const walletEntries = entries.filter((e) => e.walletAddress === walletAddress);
  res.json({ payments: walletEntries });
}

/**
 * GET /api/payments
 * Retrieve all logged payments (admin).
 */
export function handleGetAllPayments(
  _req: unknown,
  res: { json: (body: unknown) => void },
): void {
  res.json({ payments: entries, total: entries.length });
}

// ─── Express app wiring example ───────────────────────────────────────────────

/**
 * Register vault routes on an existing Express app.
 *
 * @example
 * import express from 'express';
 * import { registerVaultRoutes } from 'phantom-ows-payments/backend/vault';
 *
 * const app = express();
 * app.use(express.json());
 * registerVaultRoutes(app);
 */
export function registerVaultRoutes(app: {
  post: (path: string, handler: Function) => void;
  get: (path: string, handler: Function) => void;
}): void {
  app.post('/api/payments', handleLogPayment);
  app.get('/api/payments/:walletAddress', handleGetPayments);
  app.get('/api/payments', handleGetAllPayments);

  console.log('[vault] Routes registered: POST /api/payments, GET /api/payments/:walletAddress');
}

// ─── x402 Facilitator Helpers ─────────────────────────────────────────────────

/**
 * Build a Solana x402 challenge response (PAYMENT-REQUIRED header value).
 *
 * Use this on your API server to gate endpoints behind x402 payments.
 *
 * @example
 * app.get('/api/premium-data', (req, res) => {
 *   if (!req.headers['payment-signature']) {
 *     const challenge = buildSolanaX402Challenge({
 *       amount: '1000000', // 1 USDC (6 decimals)
 *       asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC devnet
 *       payTo: process.env.TREASURY_WALLET!,
 *       resourceUrl: req.url,
 *     });
 *     res.status(402).set('PAYMENT-REQUIRED', challenge).json({ error: 'Payment required' });
 *     return;
 *   }
 *   // Verify signature and serve content...
 * });
 */
export function buildSolanaX402Challenge(opts: {
  amount: string;
  asset: string;
  payTo: string;
  resourceUrl: string;
  memo?: string;
  network?: string;
  maxTimeoutSeconds?: number;
  /** Optional: base64-encoded partially-signed transaction */
  partialTransaction?: string;
}): string {
  const payload = {
    x402Version: 2,
    resource: {
      url: opts.resourceUrl,
      description: 'Premium content',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network: opts.network ?? 'solana:mainnet',
        amount: opts.amount,
        asset: opts.asset,
        payTo: opts.payTo,
        maxTimeoutSeconds: opts.maxTimeoutSeconds ?? 60,
        ...(opts.memo ? { memo: opts.memo } : {}),
        ...(opts.partialTransaction
          ? { extra: { transaction: opts.partialTransaction } }
          : {}),
      },
    ],
    extensions: {},
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Verify a PAYMENT-SIGNATURE header on-chain (Solana).
 *
 * In production, use the x402 facilitator service from coinbase/x402 or
 * implement on-chain verification yourself.
 *
 * This is a stub — replace with real verification logic.
 */
export async function verifySolanaPaymentSignature(
  signatureHeader: string,
  expectedAmount: string,
  expectedPayTo: string,
): Promise<{ verified: boolean; txHash?: string; error?: string }> {
  try {
    const jsonStr = Buffer.from(signatureHeader, 'base64').toString('utf8');
    const payload = JSON.parse(jsonStr) as {
      payload: string;
      resource: { payTo: string; amount: string };
    };

    if (payload.resource.payTo !== expectedPayTo) {
      return { verified: false, error: 'payTo mismatch' };
    }

    if (payload.resource.amount !== expectedAmount) {
      return { verified: false, error: 'amount mismatch' };
    }

    // TODO: broadcast or verify the transaction on-chain
    // const connection = new Connection(process.env.SOLANA_RPC_URL!);
    // const tx = Transaction.from(Buffer.from(payload.payload, 'base64'));
    // const txHash = await connection.sendRawTransaction(tx.serialize());
    // await connection.confirmTransaction(txHash);

    return { verified: true, txHash: 'stub-tx-hash' };
  } catch (err) {
    return { verified: false, error: String(err) };
  }
}
