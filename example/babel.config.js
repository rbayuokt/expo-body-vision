module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // babel-preset-expo resolves from the library root, where it can miss react-native-worklets
    // in this example. Declaring the plugin here is explicit and must stay last.
    plugins: ['react-native-worklets/plugin'],
  };
};
