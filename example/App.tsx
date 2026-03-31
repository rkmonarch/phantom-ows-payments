import 'react-native-get-random-values'; // polyfill — must be first

import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PhantomOwsProvider } from 'phantom-ows-payments';

import { HomeScreen } from './screens/HomeScreen';
import { BlogScreen } from './screens/BlogScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const PHANTOM_APP_ID = process.env.EXPO_PUBLIC_PHANTOM_APP_ID ?? 'your-phantom-app-id';

export default function App() {
  return (
    <PhantomOwsProvider
      config={{
        appId: PHANTOM_APP_ID,
        scheme: 'phantom-ows-example',
        cluster: 'mainnet-beta',
        solanaRpcUrl: process.env.EXPO_PUBLIC_RPC ?? 'https://api.mainnet-beta.solana.com',
        defaultPolicy: {
          dailyLimitUsd: 50,
          perTransactionLimitUsd: 10,
          allowedChains: ['solana:mainnet'],
          requireBiometrics: true,
          autoApproveBelow: 0.10,
        },
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F5F3FF" />
      <SafeAreaView style={styles.safe}>
        <AppContent />
      </SafeAreaView>
    </PhantomOwsProvider>
  );
}

type Tab = 'home' | 'blog' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home',     label: 'Home',     icon: '⌂' },
  { id: 'blog',     label: 'Blog',     icon: '✦' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

function AppContent() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <View style={styles.container}>
      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'home'     && <HomeScreen />}
        {tab === 'blog'     && <BlogScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </ScrollView>

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={styles.tabItem}
            onPress={() => setTab(t.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabIcon, tab === t.id && styles.tabIconActive]}>
              {t.icon}
            </Text>
            <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>
              {t.label}
            </Text>
            {tab === t.id && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F3FF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F5F3FF',
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EDE9FE',
    paddingBottom: 24,
    paddingTop: 10,
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    position: 'relative',
  },
  tabIcon: {
    fontSize: 20,
    color: '#C4B5FD',
  },
  tabIconActive: {
    color: '#7C3AED',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#C4B5FD',
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: '#7C3AED',
  },
  tabIndicator: {
    position: 'absolute',
    top: -10,
    width: 28,
    height: 3,
    backgroundColor: '#7C3AED',
    borderRadius: 2,
  },
});
