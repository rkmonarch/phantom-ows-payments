import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSolana } from '@phantom/react-native-sdk';
import {
  usePayWithPhantomOws,
  usePhantomOwsWallet,
  PaymentApprovalSheet,
  type X402PaymentAccept,
  type X402PaymentRequired,
} from 'phantom-ows-payments';

// ─── Demo: direct SOL transfer (no x402 server needed) ───────────────────────
// This tests Phantom signing end-to-end. For a real x402 flow you'd call
// payAndFetch('https://your-api.com/paid-endpoint') instead.

const DEMO_RECIPIENT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const DEMO_LAMPORTS = 1000; // 0.000001 SOL

// Demo x402 challenge — requires a live facilitator server to actually sign.
// Shown here so the UI / approval sheet can be exercised without a server.
const DEMO_X402_CHALLENGE: X402PaymentRequired = {
  x402Version: 2,
  resource: {
    url: 'https://api.example.com/premium-data',
    description: 'Premium market data feed',
    mimeType: 'application/json',
  },
  accepts: [
    {
      scheme: 'exact',
      network: 'solana:devnet',
      amount: '100000', // 0.10 USDC
      asset: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      payTo: DEMO_RECIPIENT,
      maxTimeoutSeconds: 60,
      memo: 'Premium data access',
    },
  ],
};

export function PaymentScreen() {
  const { isConnected, solanaAddress } = usePhantomOwsWallet();
  const { solana } = useSolana();
  const { isPaying } = usePayWithPhantomOws();

  const [isSending, setIsSending] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState('');

  // Approval sheet state
  const [pendingAccept, setPendingAccept] = useState<X402PaymentAccept | null>(null);

  // ── Demo: direct SOL transfer via Phantom signAndSendTransaction ─────────────
  const handleDirectTransfer = async () => {
    if (!solana.isConnected) {
      Alert.alert('Error', 'Wallet not connected');
      return;
    }
    setIsSending(true);
    setLastError(null);
    setLastTx(null);
    try {
      // Dynamic import keeps @solana/web3.js as a peer dep
      const { Transaction, SystemProgram, PublicKey, Connection, clusterApiUrl } =
        await import('@solana/web3.js');

      const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
      const fromPubkey = new PublicKey(solanaAddress!);
      const toPubkey = new PublicKey(DEMO_RECIPIENT);

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: fromPubkey,
      }).add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: DEMO_LAMPORTS,
        }),
      );

      const { signature } = await solana.signAndSendTransaction(tx);

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      );

      setLastTx(signature);
      Alert.alert('Transfer Sent!', `Signature:\n${signature.slice(0, 20)}...`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
      Alert.alert('Error', msg);
    } finally {
      setIsSending(false);
    }
  };

  // ── Demo: show x402 approval sheet (UI preview without a live server) ────────
  const handleShowApprovalSheet = () => {
    setPendingAccept(DEMO_X402_CHALLENGE.accepts[0]!);
  };

  const handleApprove = () => {
    setPendingAccept(null);
    Alert.alert(
      'x402 Flow',
      'In production this would sign & submit the server-provided transaction.\n\nWire up payAndFetch() to a real x402 endpoint to complete the flow.',
    );
  };

  if (!isConnected) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Connect your wallet first (Wallet tab)</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payments</Text>
      <Text style={styles.subtitle}>
        Test direct SOL transfers and the x402 approval UI.
      </Text>

      {/* Direct SOL transfer — works immediately with a funded devnet wallet */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Direct SOL Transfer</Text>
        <Text style={styles.hint}>
          Sends 0.000001 SOL on devnet to the demo address.{'\n'}
          Requires your wallet to be funded — use{' '}
          <Text style={styles.mono}>solfaucet.com</Text> if needed.
        </Text>
        <InfoRow label="To" value={`${DEMO_RECIPIENT.slice(0, 8)}...${DEMO_RECIPIENT.slice(-6)}`} />
        <InfoRow label="Amount" value="0.000001 SOL (devnet)" />

        <TouchableOpacity
          style={styles.payButton}
          onPress={handleDirectTransfer}
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payButtonText}>Send SOL</Text>
          )}
        </TouchableOpacity>

        {lastTx && (
          <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">
            ✓ {lastTx}
          </Text>
        )}
        {lastError && <Text style={styles.errorText}>{lastError}</Text>}
      </View>

      {/* x402 Approval Sheet demo */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>x402 Approval Sheet</Text>
        <Text style={styles.hint}>
          Preview the payment approval UI. Wire up{' '}
          <Text style={styles.mono}>payAndFetch()</Text> to a live x402 endpoint
          for the full autonomous payment flow.
        </Text>
        <InfoRow label="Amount" value="0.10 USDC" />
        <InfoRow label="Network" value="Solana Devnet" />
        <InfoRow label="Resource" value="api.example.com/premium-data" />

        <TouchableOpacity
          style={[styles.payButton, styles.secondaryButton]}
          onPress={handleShowApprovalSheet}
        >
          <Text style={styles.payButtonText}>Preview Approval Sheet</Text>
        </TouchableOpacity>
      </View>

      {/* Custom URL */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>payAndFetch (x402 auto-pay)</Text>
        <Text style={styles.hint}>
          Enter any URL returning HTTP 402. The library fetches it, parses the
          challenge, checks policy, gets approval, signs, and retries — all in
          one call.
        </Text>
        <TextInput
          style={styles.input}
          value={customUrl}
          onChangeText={setCustomUrl}
          placeholder="https://your-api.com/paid-endpoint"
          placeholderTextColor="#444"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TouchableOpacity
          style={[styles.payButton, styles.secondaryButton]}
          onPress={() =>
            Alert.alert('payAndFetch', `Would call:\npayAndFetch("${customUrl}")`)
          }
          disabled={!customUrl}
        >
          <Text style={styles.payButtonText}>Fetch & Auto-Pay</Text>
        </TouchableOpacity>
      </View>

      {/* Approval Sheet */}
      <PaymentApprovalSheet
        visible={pendingAccept !== null}
        accept={pendingAccept}
        resourceUrl={DEMO_X402_CHALLENGE.resource?.url}
        amountUsd={0.10}
        onApprove={handleApprove}
        onReject={() => setPendingAccept(null)}
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  hint: { color: '#666', fontSize: 13, lineHeight: 18 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { color: '#888', fontSize: 14 },
  infoValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  payButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButton: { backgroundColor: '#2A2A3E' },
  payButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  input: {
    backgroundColor: '#0D0D1A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  txHash: { color: '#22C55E', fontFamily: 'monospace', fontSize: 12 },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    backgroundColor: '#EF444411',
    padding: 10,
    borderRadius: 8,
  },
  mono: { fontFamily: 'monospace' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { color: '#555', fontSize: 15, textAlign: 'center' },
});
