import ExpoBodyVision from './ExpoBodyVisionModule';
import { BodyVisionError } from './errors';
import { resolveAsset, resolveModel, type PoseModelSource } from './model';
import { validateRule, type RuleDefinition } from './rules';
import { validateTarget } from './targets';
import type {
  PerformanceMode,
  SmoothingOptions,
  SmoothingPreset,
  TargetDefinition,
  TrackingOptions,
} from './types';

/** A `require()`d video, a file or content URI, or a file path. */
export type VideoSource = number | string | { uri: string };

export interface AnalyzeVideoOptions {
  /** Poses, exercises and targets, the same as on `BodyVisionView`. Targets use the whole frame. */
  rules?: (RuleDefinition | TargetDefinition)[];
  backend?: string;
  model?: PoseModelSource;
  /** `accuracy` also picks the larger MediaPipe model. The rate itself comes from `fps`. */
  performance?: PerformanceMode;
  smoothing?: SmoothingPreset | SmoothingOptions;
  tracking?: TrackingOptions;
  /** Frames analysed per second of video. Default 30, or every frame of slower videos. */
  fps?: number;
  /** Also return every analysed frame's joints. Default false. */
  landmarks?: boolean;
}

/** An event from the video, stamped with its time in the video in milliseconds. */
export interface VideoEvent {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface VideoAnalysis {
  durationMs: number;
  /** Upright frame size in pixels. */
  width: number;
  height: number;
  framesAnalyzed: number;
  sourceFps: number;
  backend: string;
  delegate: string;
  averageInferenceMs: number;
  events: VideoEvent[];
  /**
   * With `landmarks: true`, each analysed frame's joints straight from the model, before
   * smoothing. `points` holds x, y (0 to 1 in the upright frame) and confidence per joint, in
   * `JOINTS` order.
   */
  landmarks?: { timestamp: number; points: number[] }[];
}

/**
 * Runs a video file through the pose model and the same engine as the live camera, as fast as the
 * phone allows. Nothing is drawn. You get the events (reps, poses, hits) and optionally the joints.
 */
export async function analyzeVideo(
  source: VideoSource,
  options: AnalyzeVideoOptions = {}
): Promise<VideoAnalysis> {
  const uri =
    typeof source === 'number'
      ? await resolveAsset(source)
      : typeof source === 'string'
        ? source
        : source.uri;
  if (!uri) throw new BodyVisionError('VIDEO_READ_FAILED', 'No video given.');
  const rules = (options.rules ?? []).map((rule, i) => {
    const path = `rules[${i}]`;
    if (rule.type === 'target') {
      validateTarget(rule, path);
      const { style: _style, ...rest } = rule;
      return rest;
    }
    validateRule(rule, path);
    return rule;
  });
  const config: Record<string, unknown> = { rules };
  if (options.backend !== undefined) config.backend = options.backend;
  const model = await resolveModel(options.model);
  if (model !== undefined) config.model = model;
  if (options.performance !== undefined) config.performance = options.performance;
  if (options.smoothing !== undefined) config.smoothing = options.smoothing;
  if (options.tracking !== undefined) config.tracking = options.tracking;
  try {
    return await ExpoBodyVision.analyzeVideo(uri, config, {
      fps: options.fps,
      landmarks: options.landmarks ?? false,
    });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    throw new BodyVisionError((e.code as never) ?? 'VIDEO_READ_FAILED', e.message ?? String(error));
  }
}
