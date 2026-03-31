# phantom-ows-payments

A React Native library that wires together Phantom embedded wallets, OWS spending policies, and x402 autonomous payments — so you can gate content behind on-chain micropayments with a single hook call.

---

## What's inside

| Layer | What it does |
|---|---|
| **Phantom Connect** | Social login (Google / Apple) with embedded Solana wallets — no seed phrase, keys stay in Phantom's KMS |
| **OWS Policy Engine** | Daily limits, per-tx caps, chain allowlists, biometric gates — enforced client-side before every payment |
| **x402 Payments** | Full HTTP 402 flow — fetch a URL, auto-pay the challenge, retry, return the content |
| **React hooks & UI** | `usePayWithPhantomOws`, `usePolicy`, `usePhantomOwsWallet`, `ConnectButton`, `TransactionHistory` |

---

## Example app

The `example/` directory has a working blog paywall demo:

- **Home** — connect with Google or Apple, view your Solana balance
- **Blog** — articles gated behind 0.0001 SOL x402 payments on mainnet
- **Settings** — view and manage your OWS spending policy, transaction history, disconnect wallet

To run it:

```bash
# 1. Start the blog server
cd example/server
npm install
npm run dev

# 2. In another terminal, start the app
cd example
npx expo start
```

Set your Phantom App ID in `example/.env`:

```
EXPO_PUBLIC_PHANTOM_APP_ID=your-app-id-here
```

Get an App ID from the [Phantom Developer Portal](https://phantom.app/portal).

---

## How it works

### Phantom Connect

Users sign in with Google or Apple. Phantom creates an embedded wallet backed by their cloud KMS — the private keys never leave Phantom's infrastructure. As a developer you never see or touch the user's keys.

```tsx
import { PhantomOwsProvider, ConnectButton } from 'phantom-ows-payments';

export default function App() {
  return (
    <PhantomOwsProvider
      config={{
        appId: 'YOUR_PHANTOM_APP_ID',
        scheme: 'your-app-scheme',
        cluster: 'mainnet-beta',
        solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
        defaultPolicy: {
          dailyLimitUsd: 50,
          perTransactionLimitUsd: 10,
          allowedChains: ['solana:mainnet'],
          requireBiometrics: true,
          autoApproveBelow: 0.10,
        },
      }}
    >
      <YourApp />
    </PhantomOwsProvider>
  );
}

// Renders "Sign in with Google" and "Sign in with Apple"
<ConnectButton
  showBothProviders
  onConnected={(address) => console.log('Connected:', address)}
/>
```

### OWS Policy Engine

The policy runs client-side inside `usePayWithPhantomOws` and blocks payments before they're even attempted. No backend approval system needed.

```ts
interface OwsPolicy {
  dailyLimitUsd: number;
  perTransactionLimitUsd?: number;
  allowedChains: string[];        // CAIP-2, e.g. 'solana:mainnet'
  allowedAssets?: string[];
  allowedDestinations?: string[];
  paused: boolean;
  requireBiometrics: boolean;
  autoApproveBelow?: number;      // skip biometrics below this USD amount
}
```

Update policy at runtime:

```ts
const { policy, pause, resume, updatePolicy } = usePolicy();

// Pause all payments
pause();

// Tighten the daily limit
updatePolicy({ dailyLimitUsd: 10 });
```

### x402 Payments

Your server returns a 402 with the payment details in a header. The client library handles the rest automatically.

**Server** (Express):

```ts
const challenge = {
  x402Version: 2,
  resource: { url: req.url },
  accepts: [{
    scheme: 'exact',
    network: 'solana:mainnet',
    amount: '100000',        // lamports
    asset: 'SOL',
    payTo: TREASURY_WALLET,
    maxTimeoutSeconds: 120,
  }],
  extensions: {},
};

res.status(402)
  .set('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(challenge)).toString('base64'))
  .json({ error: 'Payment required' });
```

**Client**:

```ts
const { payAndFetch, isPaying } = usePayWithPhantomOws();

const { response, payment } = await payAndFetch(
  'https://your-server.com/api/articles/123',
  { amountUsd: 0.0001 }
);

const article = await response.json();
console.log('Paid via tx:', payment.txHash);
```

The full flow is: fetch → receive 402 → parse challenge → policy check → biometric gate (if required) → Phantom signs and broadcasts → retry request with payment signature → server verifies on-chain → content returned.

---

## Hooks

### `usePhantomOwsWallet()`

```ts
const {
  isConnected,
  isLoading,
  solanaAddress,
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

### `usePolicy()`

```ts
const {
  policy,
  todaySpendUsd,
  remainingDailyUsd,
  pause,
  resume,
  updatePolicy,
} = usePolicy();
```

### `useTransactionHistory()`

```ts
const {
  history,
  successfulPayments,
  failedPayments,
  totalSpentUsd,
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
| `style` | `ViewStyle` | — |

### `<TransactionHistory />`

```tsx
<TransactionHistory
  filter="success"   // 'success' | 'failed' | 'pending' | undefined
  maxItems={20}
  emptyMessage="No transactions yet"
/>
```

---

## License

MIT
