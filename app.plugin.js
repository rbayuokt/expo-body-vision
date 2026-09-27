const { AndroidConfig, withInfoPlist, withAndroidManifest } = require('expo/config-plugins');

const DEFAULT_CAMERA_PERMISSION = 'Allow $(PRODUCT_NAME) to access your camera';
const TEST_INPUT_KEY = 'ExpoBodyVisionTestInput';

/**
 * Sets the camera usage string and CAMERA permission. `enableTestInput` lets `testInput`
 * replace the camera with recorded body frames. Leave it off in shipped apps.
 */
module.exports = function withBodyVision(config, { cameraPermission, enableTestInput } = {}) {
  config = withInfoPlist(config, (c) => {
    c.modResults.NSCameraUsageDescription =
      cameraPermission || c.modResults.NSCameraUsageDescription || DEFAULT_CAMERA_PERMISSION;
    if (enableTestInput) c.modResults[TEST_INPUT_KEY] = true;
    else delete c.modResults[TEST_INPUT_KEY];
    return c;
  });
  return withAndroidManifest(config, (c) => {
    AndroidConfig.Permissions.ensurePermissions(c.modResults, ['android.permission.CAMERA']);
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(app, TEST_INPUT_KEY);
    if (enableTestInput) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, TEST_INPUT_KEY, 'true');
    }
    return c;
  });
};
