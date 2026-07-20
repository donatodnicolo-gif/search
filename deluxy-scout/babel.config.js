module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Il plugin di reanimated (usato dal drawer) DEVE essere l'ultimo.
    plugins: ['react-native-reanimated/plugin'],
  };
};
