import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  usePayWithPhantomOws,
  usePhantomOwsWallet,
  PaymentApprovalSheet,
  validateX402Challenge,
  type X402PaymentAccept,
  type X402PaymentRequired,
} from 'phantom-ows-payments';

// ─── Demo x402 challenge (would normally come from a real 402 response) ────────
const DEMO_CHALLENGE: X402PaymentRequired = {
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
      amount: '100000', // 0.10 USDC (6 decimals)
      asset: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', // USDC devnet
      payTo: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      maxTimeoutSeconds: 60,
      memo: 'Premium data access',
      extra: {
        // In a real x402 SVM flow the server would provide the partial tx here
        transaction: '',
      },
    },
  ],
};

export function PaymentScreen() {
  const { isConnected } = usePhantomOwsWallet();
  const { payChallenge, isPaying, lastError } = usePayWithPhantomOws();

  const [customUrl, setCustomUrl] = useState('');
  const [pendingAccept, setPendingAccept] = useState<X402PaymentAccept | null>(null);
  const [pendingChallenge, setPendingChallenge] = useState<X402PaymentRequired | null>(null);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    txHash?: string;
  } | null>(null);

  const handlePayDemo = () => {
    // Show approval sheet before paying
    setPendingAccept(DEMO_CHALLENGE.accepts[0]!);
    setPendingChallenge(DEMO_CHALLENGE);
  };

  const handleApprove = async () => {
    if (!pendingChallenge) return;
    setPendingAccept(null);

    try {
      const result = await payChallenge(
        pendingChallenge,
        pendingChallenge.resource?.url ?? 'https://api.example.com',
        { amountUsd: 0.10, skipApproval: true }, // biometrics already handled by sheet
      );
      setLastResult({ success: result.success, txHash: result.txHash });
      Alert.alert(
        result.success ? 'Payment Successful' : 'Payment Failed',
        result.txHash
          ? `Transaction: ${result.txHash.slice(0, 20)}...`
          : 'No transaction hash returned',
      );
    } catch (err) {
      setLastResult({ success: false });
      Alert.alert('Error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPendingChallenge(null);
    }
  };

  const handleReject = () => {
    setPendingAccept(null);
    setPendingChallenge(null);
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
      <Text style={styles.title}>x402 / MPP Payments</Text>
      <Text style={styles.subtitle}>
        Test the autonomous payment flow. In production, the challenge comes
        from a real HTTP 402 response.
      </Text>

      {/* Demo payment */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Demo Payment</Text>
        <View style={styles.challengeInfo}>
          <InfoRow label="Amount" value="0.10 USDC" />
          <InfoRow label="Network" value="Solana Devnet" />
          <InfoRow label="Resource" value="api.example.com/premium-data" />
          <InfoRow label="Memo" value="Premium data access" />
        </View>

        <TouchableOpacity
          style={styles.payButton}
          onPress={handlePayDemo}
          disabled={isPaying}
        >
          {isPaying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payButtonText}>Pay 0.10 USDC</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Custom URL (payAndFetch) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Fetch + Auto-Pay URL</Text>
        <Text style={styles.hint}>
          Enter any URL that returns an HTTP 402 with a PAYMENT-REQUIRED header.
          The library will pay automatically and return the content.
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
            Alert.alert(
              'payAndFetch',
              `Would call payAndFetch("${customUrl}") — hook it up to your real API!`,
            )
          }
          disabled={!customUrl || isPaying}
        >
          <Text style={styles.payButtonText}>Fetch & Pay</Text>
        </TouchableOpacity>
      </View>

      {/* Last result */}
      {lastResult && (
        <View style={[styles.result, { borderColor: lastResult.success ? '#22C55E' : '#EF4444' }]}>
          <Text style={[styles.resultText, { color: lastResult.success ? '#22C55E' : '#EF4444' }]}>
            {lastResult.success ? 'Payment confirmed' : 'Payment failed'}
          </Text>
          {lastResult.txHash && (
            <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">
              {lastResult.txHash}
            </Text>
          )}
        </View>
      )}

      {/* Error */}
      {lastError && (
        <Text style={styles.error}>{lastError.message}</Text>
      )}

      {/* Approval Sheet */}
      <PaymentApprovalSheet
        visible={pendingAccept !== null}
        accept={pendingAccept}
        resourceUrl={pendingChallenge?.resource?.url}
        amountUsd={0.10}
        onApprove={handleApprove}
        onReject={handleReject}
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
  container: {
    gap: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
  },
  challengeInfo: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: '#888',
    fontSize: 14,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  payButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#2A2A3E',
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
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
  result: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  resultText: {
    fontSize: 15,
    fontWeight: '600',
  },
  txHash: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  error: {
    color: '#EF4444',
    fontSize: 14,
    backgroundColor: '#EF444411',
    padding: 12,
    borderRadius: 10,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#555',
    fontSize: 15,
    textAlign: 'center',
  },
});
