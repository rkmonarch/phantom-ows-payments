// NOTE: Add `import 'react-native-get-random-values'` as the very first line
// in your app's entry file (e.g. index.ts). The library does not bundle it.

// ─── Provider ─────────────────────────────────────────────────────────────────
export { PhantomOwsProvider, usePhantomOws } from './PhantomOwsProvider';

// ─── Hooks ────────────────────────────────────────────────────────────────────
export { usePhantomOwsWallet } from './hooks/usePhantomOwsWallet';
export { usePayWithPhantomOws } from './hooks/usePayWithPhantomOws';
export { usePolicy } from './hooks/usePolicy';
export { useTransactionHistory } from './hooks/useTransactionHistory';

// ─── Components ───────────────────────────────────────────────────────────────
export { ConnectButton } from './components/ConnectButton';
export { PaymentApprovalSheet } from './components/PaymentApprovalSheet';
export { TransactionHistory } from './components/TransactionHistory';

// ─── Utilities ────────────────────────────────────────────────────────────────
export {
  fetchWithX402,
  retryWithPayment,
  decodeX402Header,
  validateX402Challenge,
  selectPaymentOption,
  encodePaymentSignature,
} from './utils/parseMppChallenge';

export {
  checkPolicy,
  computeTodaySpend,
  isSvmNetwork,
  isEvmNetwork,
  logToVault,
  buildAndSignSvmTransfer,
} from './utils/owsCompliance';

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  // x402 / MPP
  X402PaymentRequired,
  X402PaymentAccept,
  X402PaymentPayload,
  X402SettlementResponse,
  // OWS Policy
  OwsPolicy,
  PolicyCheckResult,
  DailySpend,
  // Wallet
  PhantomOwsAccount,
  PhantomOwsWalletState,
  // History
  PaymentRecord,
  PaymentStatus,
  // Payment hook
  PaymentOptions,
  PaymentResult,
  // Provider
  PhantomOwsConfig,
  PhantomOwsContextValue,
} from './types';
