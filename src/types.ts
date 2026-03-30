// ─── x402 / MPP Types ────────────────────────────────────────────────────────

export interface X402Resource {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface X402PaymentAccept {
  scheme: string;            // 'exact'
  network: string;           // 'solana:mainnet' | 'eip155:8453' etc.
  amount: string;            // token units (e.g. "1000000" for 1 USDC)
  asset: string;             // mint address or ERC-20 contract
  payTo: string;             // destination wallet
  maxTimeoutSeconds: number;
  feePayer?: string;         // SVM: optional fee payer
  memo?: string;
  extra?: Record<string, unknown>;
}

export interface X402PaymentRequired {
  x402Version: number;
  error?: string;
  resource?: X402Resource;
  accepts: X402PaymentAccept[];
  extensions?: Record<string, unknown>;
}

export interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: string;           // base64-encoded signed transaction (SVM) or EIP-712 sig (EVM)
  resource: {
    url: string;
    amount: string;
    asset: string;
    payTo: string;
  };
}

export interface X402SettlementResponse {
  success: boolean;
  txHash?: string;           // transaction signature (Solana) or hash (EVM)
  network: string;
  error?: string;
}

// ─── OWS Policy Types ────────────────────────────────────────────────────────

export interface OwsPolicy {
  id: string;
  name?: string;
  dailyLimitUsd: number;
  perTransactionLimitUsd?: number;
  /** CAIP-2 chain IDs — e.g. 'solana:mainnet', 'eip155:8453' */
  allowedChains: string[];
  /** Token mint / contract addresses allowed to spend */
  allowedAssets?: string[];
  /** Allowlisted recipient addresses */
  allowedDestinations?: string[];
  /** When true, all payments are blocked */
  paused: boolean;
  /** Require biometric/PIN confirmation before every payment */
  requireBiometrics: boolean;
  /** Auto-approve payments below this USD threshold without biometrics */
  autoApproveBelow?: number;
}

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  requiresApproval: boolean;
}

export interface DailySpend {
  date: string;      // 'YYYY-MM-DD'
  usd: number;
}

// ─── Wallet Types ─────────────────────────────────────────────────────────────

export interface PhantomOwsAccount {
  address: string;
  chain: 'solana' | 'ethereum';
  publicKey?: string;
}

export interface PhantomOwsWalletState {
  isConnected: boolean;
  isLoading: boolean;
  accounts: PhantomOwsAccount[];
  solanaAddress?: string;
  evmAddress?: string;
}

// ─── Transaction History ─────────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'success' | 'failed';

export interface PaymentRecord {
  id: string;
  timestamp: number;
  amount: string;
  amountUsd?: number;
  asset: string;
  destination: string;
  network: string;
  txHash?: string;
  status: PaymentStatus;
  memo?: string;
  resourceUrl?: string;
}

// ─── Payment Hook ─────────────────────────────────────────────────────────────

export interface PaymentOptions {
  /** Preferred network to use when multiple accepts are available */
  preferredNetwork?: string;
  /** USD price to use for policy checks (if not provided, skips USD limit check) */
  amountUsd?: number;
  /** Override biometric approval — useful for auto-pay agents */
  skipApproval?: boolean;
}

export interface PaymentResult {
  success: boolean;
  txHash?: string;
  network: string;
  record: PaymentRecord;
}

// ─── Provider Config ──────────────────────────────────────────────────────────

export interface PhantomOwsConfig {
  /** Your Phantom app ID from https://phantom.app/portal */
  appId: string;
  /** Your app's custom URL scheme (e.g. "myapp") — used for OAuth deep linking */
  scheme: string;
  /** Solana cluster */
  cluster?: 'mainnet-beta' | 'devnet' | 'testnet';
  /** Solana RPC URL for transaction building/submitting */
  solanaRpcUrl?: string;
  /** Default OWS policy applied to all wallets */
  defaultPolicy?: Partial<OwsPolicy>;
  /** Backend vault URL for audit logging */
  vaultUrl?: string;
  /** Phantom theme */
  theme?: 'dark' | 'light';
}

// ─── Context Value ────────────────────────────────────────────────────────────

export interface PhantomOwsContextValue {
  wallet: PhantomOwsWalletState;
  connect: (provider: 'google' | 'apple') => Promise<void>;
  disconnect: () => void;
  policy: OwsPolicy;
  updatePolicy: (patch: Partial<OwsPolicy>) => Promise<void>;
  history: PaymentRecord[];
  addRecord: (record: PaymentRecord) => void;
  config: PhantomOwsConfig;
}
