# phantom-ows-payments

> The easiest way to add Phantom embedded wallets + OWS agent-ready spending policies + x402/MPP autonomous payments to your React Native app.

```
npm install phantom-ows-payments
```

## What's inside

| Layer | What it does |
|---|---|
| **Phantom Connect** | Social login (Google / Apple) with self-custodial embedded Solana wallets — no seed phrase |
| **OWS Policy Engine** | Daily limits, per-tx caps, chain/asset/destination allowlists, biometric gates |
| **x402 / MPP Payments** | Full HTTP 402 flow — fetch a URL, auto-pay the challenge, retry, return the content |
| **React hooks & UI** | `usePayWithPhantomOws`, `usePolicy`, `ConnectButton`, `PaymentApprovalSheet`, `TransactionHistory` |
| **Backend vault** | Express helpers for audit logging and building x402 challenge headers server-side |

---

## Quickstart

### 1. Install dependencies

```bash
npm install phantom-ows-payments @phantom/react-native-sdk \
  @solana/web3.js @react-native-async-storage/async-storage \
  expo-local-authentication expo-secure-store \
  react-native-get-random-values
```

### 2. Add the polyfill as the very first import in your entry file

```ts
// index.ts or App.tsx — MUST be first
import 'react-native-get-random-values';
```

### 3. Wrap your app

```tsx
import { PhantomOwsProvider } from 'phantom-ows-payments';

export default function App() {
  return (
    <PhantomOwsProvider
      config={{
        appId: 'YOUR_PHANTOM_APP_ID', // from https://phantom.app/portal
        cluster: 'mainnet-beta',
        solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
        defaultPolicy: {
          dailyLimitUsd: 100,
          perTransactionLimitUsd: 25,
          allowedChains: ['solana:mainnet'],
          requireBiometrics: true,
          autoApproveBelow: 1.00, // auto-approve payments under $1
        },
      }}
    >
      <YourApp />
    </PhantomOwsProvider>
  );
}
```

### 4. Add a connect button

```tsx
import { ConnectButton } from 'phantom-ows-payments';

// Shows "Sign in with Google" + "Sign in with Apple"
<ConnectButton
  showBothProviders
  onConnected={(address) => console.log('Wallet:', address)}
/>
```

### 5. Pay an x402 endpoint

```tsx
import { usePayWithPhantomOws } from 'phantom-ows-payments';

function MyComponent() {
  const { payAndFetch, isPaying } = usePayWithPhantomOws();

  const fetchPremiumData = async () => {
    // Automatically handles HTTP 402 → parse challenge → policy check
    // → biometric approval → sign with Phantom → retry → return response
    const { response, payment } = await payAndFetch(
      'https://api.example.com/premium-data',
      { amountUsd: 0.50 } // for daily-limit tracking
    );
    const data = await response.json();
    console.log('Paid:', payment.txHash, 'Data:', data);
  };

  return (
    <Button title={isPaying ? 'Paying…' : 'Get Premium Data'} onPress={fetchPremiumData} />
  );
}
```

---

## Hooks

### `usePhantomOwsWallet()`

```ts
const {
  isConnected,
  isLoading,
  solanaAddress,
  evmAddress,
  accounts,
  connect,      // (provider: 'google' | 'apple') => Promise<void>
  disconnect,
} = usePhantomOwsWallet();
```

### `usePayWithPhantomOws()`

```ts
const {
  payAndFetch,   // fetch URL, auto-pay 402, return Response + PaymentResult
  payChallenge,  // pay an already-parsed X402PaymentRequired directly
  isPaying,
  lastError,
} = usePayWithPhantomOws();
```

**`payAndFetch` signature:**

```ts
payAndFetch(
  url: string,
  opts?: {
    preferredNetwork?: string;   // default: 'solana:mainnet'
    amountUsd?: number;          // used for daily-limit tracking
    skipApproval?: boolean;      // skip biometric gate (agents)
    fetchInit?: RequestInit;     // passed to fetch()
  }
) => Promise<{ response: Response; payment: PaymentResult }>
```

**`payChallenge` signature:**

```ts
payChallenge(
  challenge: X402PaymentRequired,  // parsed from PAYMENT-REQUIRED header
  resourceUrl: string,
  opts?: PaymentOptions
) => Promise<PaymentResult>
```

### `usePolicy()`

```ts
const {
  policy,
  todaySpendUsd,
  remainingDailyUsd,
  isPaused,
  pause,
  resume,
  setDailyLimit,
  setPerTransactionLimit,
  setRequireBiometrics,
  setAutoApproveBelow,
  addAllowedChain,
  removeAllowedChain,
  addAllowedAsset,
  addAllowedDestination,
} = usePolicy();
```

### `useTransactionHistory()`

```ts
const {
  history,
  successfulPayments,
  failedPayments,
  pendingPayments,
  totalSpentUsd,
  getByStatus,
  getByNetwork,
} = useTransactionHistory();
```

---

## Components

### `<ConnectButton />`

| Prop | Type | Default |
|---|---|---|
| `showBothProviders` | `boolean` | `true` |
| `provider` | `'google' \| 'apple'` | `'google'` |
| `onConnected` | `(address: string) => void` | — |
| `disconnectOnPress` | `boolean` | `false` |
| `style` | `ViewStyle` | — |

### `<PaymentApprovalSheet />`

Show this before triggering a payment so the user sees what they're approving.

```tsx
<PaymentApprovalSheet
  visible={showSheet}
  accept={challenge.accepts[0]}
  resourceUrl="https://api.example.com/premium"
  amountUsd={1.50}
  onApprove={handleApprove}
  onReject={handleReject}
/>
```

### `<TransactionHistory />`

```tsx
<TransactionHistory
  filter="success"   // 'success' | 'failed' | 'pending' | undefined
  maxItems={20}
  onPressRecord={(record) => console.log(record)}
/>
```

---

## OWS Policy

The library ships with a full policy engine modelled after the [Open Wallet Standard](https://openwallet.sh/).

```ts
interface OwsPolicy {
  dailyLimitUsd: number;          // block payments that exceed this
  perTransactionLimitUsd?: number;
  allowedChains: string[];        // CAIP-2, e.g. 'solana:mainnet'
  allowedAssets?: string[];       // mint/contract addresses
  allowedDestinations?: string[]; // recipient allowlist
  paused: boolean;                // kill switch
  requireBiometrics: boolean;     // Face ID / fingerprint before each tx
  autoApproveBelow?: number;      // skip biometrics for small amounts (USD)
}
```

Policies are enforced in `usePayWithPhantomOws` before every payment. You can update them at runtime via `updatePolicy()` or the `usePolicy()` helpers.

---

## x402 Protocol

The library implements the [x402 specification](https://www.x402.org/) for HTTP 402 payment flows.

**Server-side** — return a 402 with the PAYMENT-REQUIRED header:

```ts
// In your Express API
import { buildSolanaX402Challenge } from 'phantom-ows-payments/src/backend/vault';

app.get('/api/premium', (req, res) => {
  if (!req.headers['payment-signature']) {
    const challenge = buildSolanaX402Challenge({
      amount: '1000000',           // 1 USDC (6 decimals)
      asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      payTo: process.env.TREASURY_WALLET!,
      resourceUrl: req.url,
    });
    return res.status(402)
      .set('PAYMENT-REQUIRED', challenge)
      .json({ error: 'Payment required' });
  }
  // Verify signature, serve content…
  res.json({ data: 'premium content' });
});
```

**Client-side** — `payAndFetch` handles everything automatically.

---

## Backend Vault

Copy `src/backend/vault.ts` into your Express server for audit logging:

```ts
import express from 'express';
import { registerVaultRoutes } from './vault';

const app = express();
app.use(express.json());
registerVaultRoutes(app);
// POST /api/payments  — called by SDK after each payment
// GET  /api/payments/:walletAddress — history for a wallet
```

Then pass `vaultUrl` to `PhantomOwsProvider`:

```tsx
<PhantomOwsProvider config={{ ..., vaultUrl: 'https://your-backend.com' }}>
```

---

## Utilities

```ts
import {
  fetchWithX402,          // fetch + parse 402
  decodeX402Header,       // base64 decode PAYMENT-REQUIRED header
  validateX402Challenge,  // runtime type check
  selectPaymentOption,    // pick best accept from challenge
  encodePaymentSignature, // encode payload for PAYMENT-SIGNATURE header
  checkPolicy,            // standalone policy enforcement
  isSvmNetwork,           // 'solana:...' check
  isEvmNetwork,           // 'eip155:...' check
} from 'phantom-ows-payments';
```

---

## Roadmap

- [ ] EVM support (coming with Phantom EVM embedded wallets in 2026)
- [ ] MPP session channels for high-frequency micropayments
- [ ] Flutter SDK port
- [ ] Full MCP server integration for agent-to-agent payments
- [ ] On-chain policy enforcement via Solana programs

---

## License

MIT
