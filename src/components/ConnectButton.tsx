import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { usePhantomOwsWallet } from '../hooks/usePhantomOwsWallet';

export interface ConnectButtonProps {
  /** Called after successful connection */
  onConnected?: (address: string) => void;
  /** Show both Google and Apple options side-by-side */
  showBothProviders?: boolean;
  /** Which provider to show when showBothProviders is false */
  provider?: 'google' | 'apple';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disconnectOnPress?: boolean;
}

/**
 * Drop-in connect button with Google / Apple social login via Phantom.
 *
 * @example
 * <ConnectButton onConnected={(addr) => console.log(addr)} />
 */
export function ConnectButton({
  onConnected,
  showBothProviders = true,
  provider = 'google',
  style,
  textStyle,
  disconnectOnPress = false,
}: ConnectButtonProps) {
  const { isConnected, isLoading, solanaAddress, connect, disconnect } = usePhantomOwsWallet();
  const [connecting, setConnecting] = useState<'google' | 'apple' | null>(null);

  const handleConnect = async (p: 'google' | 'apple') => {
    setConnecting(p);
    try {
      await connect(p);
      if (onConnected && solanaAddress) onConnected(solanaAddress);
    } finally {
      setConnecting(null);
    }
  };

  if (isConnected) {
    if (disconnectOnPress) {
      return (
        <TouchableOpacity style={[styles.button, styles.connected, style]} onPress={disconnect}>
          <Text style={[styles.buttonText, textStyle]}>
            {truncateAddress(solanaAddress ?? '')} · Disconnect
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <View style={[styles.button, styles.connected, style]}>
        <View style={styles.dot} />
        <Text style={[styles.buttonText, textStyle]}>
          {truncateAddress(solanaAddress ?? '')}
        </Text>
      </View>
    );
  }

  if (showBothProviders) {
    return (
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.button, styles.google, style]}
          onPress={() => handleConnect('google')}
          disabled={isLoading || connecting !== null}
        >
          {connecting === 'google' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[styles.buttonText, textStyle]}>Sign in with Google</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.apple, style]}
          onPress={() => handleConnect('apple')}
          disabled={isLoading || connecting !== null}
        >
          {connecting === 'apple' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[styles.buttonText, textStyle]}>Sign in with Apple</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.button, provider === 'google' ? styles.google : styles.apple, style]}
      onPress={() => handleConnect(provider)}
      disabled={isLoading || connecting !== null}
    >
      {connecting ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={[styles.buttonText, textStyle]}>
          {`Sign in with ${provider === 'google' ? 'Google' : 'Apple'}`}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const styles = StyleSheet.create({
  row: {
    gap: 10,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 200,
  },
  google: {
    backgroundColor: '#4285F4',
  },
  apple: {
    backgroundColor: '#000000',
  },
  connected: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#7C3AED',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
});
