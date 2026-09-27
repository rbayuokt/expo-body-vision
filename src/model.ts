import type * as ExpoAsset from 'expo-asset';

import { BodyVisionError } from './errors';

/**
 * `lite` and `full` are the bundled MediaPipe models. Pass `require('./model.task')` (add `task`
 * to Metro's `assetExts`) or `{ uri }` for your own, or anything a custom backend understands.
 */
export type PoseModelSource = 'lite' | 'full' | number | { uri: string };

/** What native gets: a bundled name, a file path/URI, or undefined for the default. */
export async function resolveModel(
  model: PoseModelSource | undefined
): Promise<string | undefined> {
  if (model === undefined || typeof model === 'string') return model;
  if (typeof model === 'object') return model.uri;
  return resolveAsset(model, 'MODEL_LOAD_FAILED');
}

/** Copies a `require()`d asset out of the bundle and returns its local file URI. */
export async function resolveAsset(
  assetModule: number,
  code: 'MODEL_LOAD_FAILED' | 'VIDEO_READ_FAILED' = 'VIDEO_READ_FAILED'
): Promise<string> {
  let asset: typeof ExpoAsset;
  try {
    asset = require('expo-asset') as typeof ExpoAsset;
  } catch {
    throw new BodyVisionError(
      code,
      'Bundled files need expo-asset, install it with npx expo install expo-asset'
    );
  }
  const downloaded = await asset.Asset.fromModule(assetModule).downloadAsync();
  if (!downloaded.localUri) {
    throw new BodyVisionError(code, 'Could not resolve the bundled file.');
  }
  return downloaded.localUri;
}
