module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Enable Hermes/Flow-compatible syntax parsing (required for RN 0.79+ internals)
      'babel-plugin-syntax-hermes-parser',
    ],
  };
};
