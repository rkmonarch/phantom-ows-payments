/**
 * phantom-ows-payments — Example App
 *
 * Demonstrates:
 *  1. PhantomOwsProvider setup
 *  2. ConnectButton (Google / Apple social login)
 *  3. usePayWithPhantomOws — x402 payment flow
 *  4. usePolicy — spending limits
 *  5. TransactionHistory component
 */

import 'react-native-get-random-values'; // polyfill — must be first

import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  PhantomOwsProvider,
  ConnectButton,
  TransactionHistory,
} from 'phantom-ows-payments';

import { WalletScreen } from './screens/WalletScreen';
import { PaymentScreen } from './screens/PaymentScreen';
import { BlogScreen } from './screens/BlogScreen';

// ─── Phantom App Config ───────────────────────────────────────────────────────
// Get your App ID from https://phantom.app/portal
const PHANTOM_APP_ID = process.env.EXPO_PUBLIC_PHANTOM_APP_ID ?? 'your-phantom-app-id';

export default function App() {
  return (
    <PhantomOwsProvider
      config={{
        appId: PHANTOM_APP_ID,
        scheme: 'phantom-ows-example', // must match your app.json scheme
        cluster: 'mainnet-beta',
        solanaRpcUrl: process.env.EXPO_PUBLIC_RPC ?? 'https://api.mainnet-beta.solana.com',
        defaultPolicy: {
          dailyLimitUsd: 50,
          perTransactionLimitUsd: 10,
          allowedChains: ['solana:mainnet'],
          requireBiometrics: true,
          autoApproveBelow: 0.10,
        },
        // vaultUrl: 'https://your-backend.com', // optional audit logging
      }}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0D0D1A" />
      <SafeAreaView style={styles.safe}>
        <AppContent />
      </SafeAreaView>
    </PhantomOwsProvider>
  );
}

function AppContent() {
  const [tab, setTab] = useState<'wallet' | 'pay' | 'blog' | 'history'>('wallet');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>👻 phantom-ows</Text>
      </View>

      {/* Tab Nav */}
      <View style={styles.tabs}>
        {(['wallet', 'pay', 'blog', 'history'] as const).map((t) => (
          <Text
            key={t}
            style={[styles.tab, tab === t && styles.activeTab]}
            onPress={() => setTab(t)}
          >
            {t === 'wallet' ? 'Wallet' : t === 'pay' ? 'Pay' : t === 'blog' ? 'Blog' : 'History'}
          </Text>
        ))}
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {tab === 'wallet' && <WalletScreen />}
        {tab === 'pay' && <PaymentScreen />}
        {tab === 'blog' && <BlogScreen />}
        {tab === 'history' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transaction History</Text>
            <TransactionHistory emptyMessage="No transactions yet — try the Pay or Blog tab!" />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0D0D1A',
  },
  container: {
    flex: 1,
    backgroundColor: '#0D0D1A',
  },
  header: {
    padding: 20,
    paddingBottom: 8,
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  tab: {
    color: '#555',
    fontSize: 15,
    fontWeight: '600',
    paddingBottom: 12,
  },
  activeTab: {
    color: '#7C3AED',
    borderBottomWidth: 2,
    borderBottomColor: '#7C3AED',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
