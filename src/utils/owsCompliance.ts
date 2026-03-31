import type {
  X402PaymentAccept,
  X402PaymentPayload,
  X402SettlementResponse,
  OwsPolicy,
  PolicyCheckResult,
  DailySpend,
  PaymentRecord,
} from '../types';
import { encodePaymentSignature } from './parseMppChallenge';

// ─── Policy Engine ────────────────────────────────────────────────────────────

/**
 * Check whether a proposed payment is allowed by the active OWS policy.
 */
export function checkPolicy(
  policy: OwsPolicy,
  accept: X402PaymentAccept,
  opts: {
    amountUsd?: number;
    todaySpend?: number;
  } = {},
): PolicyCheckResult {
  if (policy.paused) {
    return { allowed: false, reason: 'Wallet payments are paused', requiresApproval: false };
  }

  if (!policy.allowedChains.includes(accept.network) && policy.allowedChains.length > 0) {
    return {
      allowed: false,
      reason: `Network ${accept.network} is not in the allowed chains list`,
      requiresApproval: false,
    };
  }

  if (policy.allowedAssets && policy.allowedAssets.length > 0) {
    if (!policy.allowedAssets.includes(accept.asset)) {
      return {
        allowed: false,
        reason: `Asset ${accept.asset} is not in the allowed assets list`,
        requiresApproval: false,
      };
    }
  }

  if (policy.allowedDestinations && policy.allowedDestinations.length > 0) {
    if (!policy.allowedDestinations.includes(accept.payTo)) {
      return {
        allowed: false,
        reason: `Destination ${accept.payTo} is not in the allowed destinations list`,
        requiresApproval: false,
      };
    }
  }

  if (opts.amountUsd !== undefined) {
    if (policy.perTransactionLimitUsd !== undefined && opts.amountUsd > policy.perTransactionLimitUsd) {
      return {
        allowed: false,
        reason: `Payment of $${opts.amountUsd} exceeds per-transaction limit of $${policy.perTransactionLimitUsd}`,
        requiresApproval: false,
      };
    }

    const todayTotal = (opts.todaySpend ?? 0) + opts.amountUsd;
    if (todayTotal > policy.dailyLimitUsd) {
      return {
        allowed: false,
        reason: `Daily limit of $${policy.dailyLimitUsd} would be exceeded (already spent $${opts.todaySpend ?? 0})`,
        requiresApproval: false,
      };
    }

    const autoApproveBelow = policy.autoApproveBelow ?? 0;
    const needsApproval = policy.requireBiometrics && opts.amountUsd > autoApproveBelow;
    return { allowed: true, requiresApproval: needsApproval };
  }

  return { allowed: true, requiresApproval: policy.requireBiometrics };
}

// ─── Daily Spend Tracker ──────────────────────────────────────────────────────

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export function computeTodaySpend(history: PaymentRecord[]): number {
  const today = getTodayKey();
  return history
    .filter(
      (r) =>
        r.status === 'success' &&
        new Date(r.timestamp).toISOString().slice(0, 10) === today,
    )
    .reduce((sum, r) => sum + (r.amountUsd ?? 0), 0);
}

// ─── SVM (Solana) x402 Signing ────────────────────────────────────────────────

/**
 * Sign a Solana x402 payment.
 *
 * The server provides a base64-encoded partially-signed transaction in the
 * challenge payload. We deserialize it, add our signature via Phantom, then
 * return the fully-signed base64 transaction ready for the PAYMENT-SIGNATURE
 * header.
 *
 * Requires @solana/web3.js to be installed.
 */
export async function signSvmPayment(
  accept: X402PaymentAccept,
  signTransaction: (tx: unknown) => Promise<unknown>,
  resourceUrl: string,
): Promise<X402PaymentPayload> {
  // The partially-signed transaction is carried in accept.extra.transaction
  const rawTx = (accept.extra as Record<string, string> | undefined)?.['transaction'];
  if (!rawTx) {
    throw new Error(
      'SVM x402 accept option is missing extra.transaction — server must provide the partial transaction',
    );
  }

  // Dynamically import @solana/web3.js to keep it as a peer dependency
  let Transaction: { from: (buf: Uint8Array) => unknown };
  try {
    const web3 = await import('@solana/web3.js');
    Transaction = web3.Transaction;
  } catch {
    throw new Error(
      '@solana/web3.js is required for Solana payments. Install it: npm i @solana/web3.js',
    );
  }

  const txBytes = Uint8Array.from(Buffer.from(rawTx, 'base64'));
  const tx = Transaction.from(txBytes);

  const signedTx = await signTransaction(tx);

  // Serialize signed tx
  const serialized = (signedTx as { serialize: (opts?: object) => Uint8Array }).serialize({
    requireAllSignatures: false,
  });
  const signedBase64 = Buffer.from(serialized).toString('base64');

  return {
    x402Version: 2,
    scheme: accept.scheme,
    network: accept.network,
    payload: signedBase64,
    resource: {
      url: resourceUrl,
      amount: accept.amount,
      asset: accept.asset,
      payTo: accept.payTo,
    },
  };
}

/**
 * Build, sign, and send a native SOL transfer for x402 payments where the
 * server does NOT provide a partial transaction (asset === 'SOL').
 *
 * The client constructs a SystemProgram.transfer tx, broadcasts it via
 * Phantom's signAndSendTransaction, waits for confirmation, and returns a
 * payload whose `payload` field is the on-chain transaction signature.
 * The server verifies this signature on-chain to confirm payment.
 *
 * Requires @solana/web3.js to be installed.
 */
export async function buildAndSignSvmTransfer(
  accept: X402PaymentAccept,
  fromAddress: string,
  signAndSendTransaction: (tx: unknown) => Promise<{ signature: string }>,
  solanaRpcUrl: string,
  resourceUrl: string,
): Promise<X402PaymentPayload> {
  let web3: typeof import('@solana/web3.js');
  try {
    web3 = await import('@solana/web3.js');
  } catch {
    throw new Error(
      '@solana/web3.js is required for Solana payments. Install it: npm i @solana/web3.js',
    );
  }

  const { Transaction, SystemProgram, PublicKey, Connection } = web3;

  const connection = new Connection(solanaRpcUrl, 'confirmed');
  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(accept.payTo);
  const lamports = parseInt(accept.amount, 10);

  if (isNaN(lamports) || lamports <= 0) {
    throw new Error(`Invalid payment amount: ${accept.amount}`);
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: fromPubkey,
  }).add(
    SystemProgram.transfer({ fromPubkey, toPubkey, lamports }),
  );

  const fromAccount = await connection.getAccountInfo(fromPubkey, 'confirmed');
  if (!fromAccount) {
    throw new Error(
      `Connected wallet ${fromAddress} does not exist on ${accept.network} yet. Fund this address on the selected Solana cluster first.`,
    );
  }

  const balance = await connection.getBalance(fromPubkey, 'confirmed');
  const fee = (await connection.getFeeForMessage(tx.compileMessage(), 'confirmed')).value ?? 5000;
  const requiredLamports = lamports + fee;
  if (balance < requiredLamports) {
    throw new Error(
      `Insufficient balance on ${accept.network}: have ${(balance / 1e9).toFixed(6)} SOL, need at least ${(requiredLamports / 1e9).toFixed(6)} SOL including fees.`,
    );
  }

  const { signature } = await signAndSendTransaction(tx);

  // Wait for on-chain confirmation before returning — the server will query it
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  return {
    x402Version: 2,
    scheme: accept.scheme,
    network: accept.network,
    payload: signature,   // on-chain tx signature — server verifies this
    resource: {
      url: resourceUrl,
      amount: accept.amount,
      asset: accept.asset,
      payTo: accept.payTo,
    },
  };
}

const DEVNET_KEYPAIR_STORAGE_KEY = 'phantom_ows_devnet_keypair';

/**
 * Load (or generate and persist) a local Solana keypair used for devnet payments.
 * Phantom's cloud KMS cannot sign devnet transactions (its spending-extension simulation
 * fails because devnet SOL has no USD price feed). We bypass it entirely for devnet by
 * signing locally and broadcasting directly via the devnet RPC.
 *
 * Key is persisted via expo-secure-store (encrypted on-device storage).
 * The returned keypair's publicKey.toBase58() is the address to fund on devnet.
 */
export async function getOrCreateDevnetKeypair(): Promise<import('@solana/web3.js').Keypair> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SecureStore: any;
  try {
    SecureStore = await import('expo-secure-store');
  } catch {
    throw new Error(
      'expo-secure-store is required for devnet keypair storage. Add it to your Expo project.',
    );
  }

  let web3: typeof import('@solana/web3.js');
  try {
    web3 = await import('@solana/web3.js');
  } catch {
    throw new Error('@solana/web3.js is required for Solana payments.');
  }

  const stored: string | null = await SecureStore.getItemAsync(DEVNET_KEYPAIR_STORAGE_KEY);
  if (stored) {
    try {
      const secretKeyArray = JSON.parse(stored) as number[];
      return web3.Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
    } catch {
      // corrupted — regenerate below
    }
  }

  const keypair = web3.Keypair.generate();
  await SecureStore.setItemAsync(
    DEVNET_KEYPAIR_STORAGE_KEY,
    JSON.stringify(Array.from(keypair.secretKey)),
  );
  console.log('[ows] Generated new devnet keypair:', keypair.publicKey.toBase58());
  return keypair;
}

/**
 * Build, sign (with a local Keypair), and send a native SOL transfer on devnet.
 * Used instead of Phantom's KMS for devnet because the KMS spending-extension
 * cannot simulate devnet transactions (no SOL/USD price feed on devnet).
 */
export async function buildAndSignSvmTransferLocal(
  accept: X402PaymentAccept,
  keypair: import('@solana/web3.js').Keypair,
  solanaRpcUrl: string,
  resourceUrl: string,
): Promise<X402PaymentPayload> {
  let web3: typeof import('@solana/web3.js');
  try {
    web3 = await import('@solana/web3.js');
  } catch {
    throw new Error('@solana/web3.js is required for Solana payments.');
  }

  const { Transaction, SystemProgram, Connection } = web3;
  const connection = new Connection(solanaRpcUrl, 'confirmed');
  const fromPubkey = keypair.publicKey;
  const toPubkey = new web3.PublicKey(accept.payTo);
  const lamports = parseInt(accept.amount, 10);

  if (isNaN(lamports) || lamports <= 0) {
    throw new Error(`Invalid payment amount: ${accept.amount}`);
  }

  const fromAccount = await connection.getAccountInfo(fromPubkey, 'confirmed');
  if (!fromAccount) {
    throw new Error(
      `Devnet payment keypair ${fromPubkey.toBase58()} has no balance. ` +
      `Fund this address at https://faucet.solana.com before paying.`,
    );
  }

  const balance = await connection.getBalance(fromPubkey, 'confirmed');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: fromPubkey,
  }).add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));

  const fee = (await connection.getFeeForMessage(tx.compileMessage(), 'confirmed')).value ?? 5000;
  const requiredLamports = lamports + fee;
  if (balance < requiredLamports) {
    throw new Error(
      `Insufficient devnet balance on ${fromPubkey.toBase58()}: ` +
      `have ${(balance / 1e9).toFixed(6)} SOL, need ${(requiredLamports / 1e9).toFixed(6)} SOL.`,
    );
  }

  tx.sign(keypair);
  const rawTx = tx.serialize();
  const signature = await connection.sendRawTransaction(rawTx, { skipPreflight: false });

  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  console.log('[ows] devnet local tx confirmed:', signature.slice(0, 12) + '...');

  return {
    x402Version: 2,
    scheme: accept.scheme,
    network: accept.network,
    payload: signature,
    resource: {
      url: resourceUrl,
      amount: accept.amount,
      asset: accept.asset,
      payTo: accept.payTo,
    },
  };
}

/**
 * Parse and validate the PAYMENT-RESPONSE header from the server.
 */
export function parseSettlementResponse(headers: Headers): X402SettlementResponse {
  const raw =
    headers.get('PAYMENT-RESPONSE') ??
    headers.get('payment-response') ??
    headers.get('X-Payment-Response');

  if (!raw) {
    // No settlement header — assume success if server returned 2xx
    return { success: true, network: 'unknown' };
  }

  let jsonStr: string;
  try {
    jsonStr = atob(raw);
  } catch {
    jsonStr = raw;
  }

  try {
    return JSON.parse(jsonStr) as X402SettlementResponse;
  } catch {
    return { success: true, network: 'unknown' };
  }
}

// ─── Vault Audit Logging ──────────────────────────────────────────────────────

/**
 * Optionally log a completed payment to a backend vault for agent audit trails.
 * Fire-and-forget — never throws.
 */
export async function logToVault(
  vaultUrl: string,
  record: PaymentRecord,
  walletAddress: string,
): Promise<void> {
  try {
    await fetch(`${vaultUrl}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record, walletAddress }),
    });
  } catch {
    // Silently ignore — vault logging is non-critical
  }
}

// ─── EVM x402 (stub — EVM support coming in Phantom SDK 2026) ────────────────

export async function signEvmPayment(
  accept: X402PaymentAccept,
  _resourceUrl: string,
): Promise<X402PaymentPayload> {
  throw new Error(
    `EVM payment signing for network ${accept.network} is not yet supported. ` +
      'Phantom EVM embedded wallet support is coming in 2026.',
  );
}

// ─── Network Detection ────────────────────────────────────────────────────────

export function isSvmNetwork(network: string): boolean {
  return network.startsWith('solana');
}

export function isEvmNetwork(network: string): boolean {
  return network.startsWith('eip155');
}

export { encodePaymentSignature };
