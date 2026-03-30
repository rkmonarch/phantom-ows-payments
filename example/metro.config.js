const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const libraryRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the library source for hot reload
config.watchFolders = [libraryRoot];

// Prefer "react-native"/"source" fields to load TypeScript source
// instead of the pre-built CJS bundle.
config.resolver.resolverMainFields = [
  'react-native',
  'source',
  'browser',
  'main',
];

// Map the library to its TypeScript source
config.resolver.extraNodeModules = {
  'phantom-ows-payments': path.resolve(libraryRoot, 'src'),
};

// Pin packages that must resolve from the example (not the library's own
// node_modules). Without this, Metro walks up from the library root and
// finds react-native 0.76 instead of 0.79.
const PINNED_TO_EXAMPLE = [
  'react',
  'react-native',
  'react-native-get-random-values',
  '@phantom/react-native-sdk',
  'expo',
  'expo-local-authentication',
  'expo-secure-store',
  'expo-web-browser',
  'expo-auth-session',
  '@solana/web3.js',
  'react-native-svg',
];

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isPinned = PINNED_TO_EXAMPLE.some(
    (pkg) => moduleName === pkg || moduleName.startsWith(pkg + '/'),
  );

  if (isPinned) {
    // Redirect resolution to start from the example's project root
    // so Metro finds the correct (0.79) version of react-native etc.
    return context.resolveRequest(
      { ...context, originModulePath: path.resolve(projectRoot, 'index.ts') },
      moduleName,
      platform,
    );
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
