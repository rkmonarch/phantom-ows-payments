import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-native',
    '@phantom/react-native-sdk',
    '@react-native-async-storage/async-storage',
    '@solana/web3.js',
    'expo-local-authentication',
    'expo-secure-store',
    'react-native-get-random-values',
  ],
});
