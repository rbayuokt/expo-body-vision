const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// The library root has its own dev copies of these in ../node_modules. Native-backed packages
// must be loaded exactly once, so imports of them always resolve from the example.
const SINGLETONS = [
  'react',
  'react-native',
  'expo',
  'expo-modules-core',
  '@shopify/react-native-skia',
  'react-native-reanimated',
  'react-native-worklets',
  'expo-speech',
];
const exampleEntry = path.join(__dirname, 'index.ts');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shared = SINGLETONS.some((p) => moduleName === p || moduleName.startsWith(`${p}/`));
  return context.resolveRequest(
    shared ? { ...context, originModulePath: exampleEntry } : context,
    moduleName,
    platform
  );
};

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, './node_modules'),
  path.resolve(__dirname, '../node_modules'),
];

config.resolver.extraNodeModules = {
  '@rbayuokt/expo-body-vision': '..',
};

config.watchFolders = [path.resolve(__dirname, '..')];

// Pose model files for the custom-model demo.
config.resolver.assetExts.push('task');

module.exports = config;
