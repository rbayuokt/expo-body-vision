import { Canvas, Rect, Shader, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useBodyVisionEvents } from '../events';
import type { RepEvent, TargetHitEvent } from '../types';
import { ANIME, FIRE, JOJO, LIGHTNING, PIXEL, SHATTER } from './shaders';
import {
  compile,
  rgb,
  uniformNames,
  useEffectLevel,
  useLayoutSize,
  Word,
  type EffectLevel,
  type ResolvedLevel,
} from './shared';

export interface Impact {
  x: number;
  y: number;
  side?: 'left' | 'right';
  /** The exercise id for reps, the target id for hits. */
  source: string;
  kind: 'rep' | 'hit';
  color: string;
}

export interface ImpactEffectProps {
  /** What triggers it: reps that carry a position (peak mode), target hits, or both. Default both. */
  on?: 'reps' | 'hits' | 'both';
  /** Exercise or target ids that trigger it. Default all. */
  sources?: string[];
  /** Per side of the body. `left` also covers events without a side. */
  colors?: { left?: string; right?: string };
  /** Sound-effect words, one picked at random per hit. `false` hides them. */
  words?: string[] | false;
  wordStyle?: StyleProp<TextStyle>;
  /** Effect radius in points. */
  size?: number;
  durationMs?: number;
  /** Speed lines for anime, crackling arcs for lightning. Default true. */
  speedLines?: boolean;
  /** Brief white flash. Default true. */
  flash?: boolean;
  /** Shockwave or crack rings. Default true. */
  ring?: boolean;
  /** Called on every impact, e.g. to shake the screen with `useImpactShake`. */
  onImpact?: (impact: Impact) => void;
  /**
   * How much it draws. `minimal`: two hits at a time, only the burst, no words or layers.
   * `balanced`: three hits, drawn near the hit, no flash. `max`: everything, full view. `auto`
   * (default) is balanced and drops to minimal when the view reduces effects. The layer and
   * word props above override the level.
   */
  level?: EffectLevel;
}

export interface ImpactEffectOptions {
  /**
   * SkSL with `half4 main(float2 p)`. It can declare any of these uniforms: `float2 center` (view
   * points), `float progress` (0 to 1), `float radius`, `float3 tint` (0 to 1), `float seed` (0 to
   * 1, random per hit), and `float useLines`, `useFlash`, `useRing` (0 or 1). Return
   * premultiplied color.
   */
  shader: string;
  words?: string[] | false;
  colors?: { left: string; right: string };
  size?: number;
  durationMs?: number;
  /** Words float up like a score pickup instead of popping in place. */
  risingWords?: boolean;
  wordStyle?: StyleProp<TextStyle>;
}

interface Burst extends Impact {
  id: number;
  seed: number;
  word: string | null;
  tilt: number;
}

const LEVELS: Record<
  ResolvedLevel,
  { bursts: number; reach: number; words: boolean; lines: boolean; flash: boolean; ring: boolean }
> = {
  minimal: { bursts: 2, reach: 1.35, words: false, lines: false, flash: false, ring: false },
  balanced: { bursts: 3, reach: 2.6, words: true, lines: true, flash: false, ring: true },
  max: { bursts: 6, reach: Infinity, words: true, lines: true, flash: true, ring: true },
};

interface Look {
  size: number;
  /** Draw area around the hit, in multiples of size. Infinity draws the whole view. */
  reach: number;
  durationMs: number;
  lines: number;
  flash: number;
  ring: number;
}

function Hit({
  effect,
  names,
  burst,
  look,
  width,
  height,
  onDone,
}: {
  effect: SkRuntimeEffect;
  names: string[];
  burst: Burst;
  look: Look;
  width: number;
  height: number;
  onDone: (id: number) => void;
}) {
  const progress = useSharedValue(0);
  const tint = rgb(burst.color);
  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: look.durationMs, easing: Easing.out(Easing.cubic) },
      (done) => {
        if (done) runOnJS(onDone)(burst.id);
      }
    );
  }, [progress, burst.id, look.durationMs, onDone]);

  const uniforms = useDerivedValue(() => {
    const all: Record<string, number | number[]> = {
      center: [burst.x, burst.y],
      progress: progress.value,
      radius: look.size,
      tint,
      seed: burst.seed,
      useLines: look.lines,
      useFlash: look.flash,
      useRing: look.ring,
    };
    const out: Record<string, number | number[]> = {};
    for (const n of names) out[n] = all[n];
    return out;
  });

  const r = look.size * look.reach;
  const x = Number.isFinite(r) ? Math.max(0, burst.x - r) : 0;
  const y = Number.isFinite(r) ? Math.max(0, burst.y - r) : 0;
  return (
    <Rect
      x={x}
      y={y}
      width={Number.isFinite(r) ? Math.min(width, burst.x + r) - x : width}
      height={Number.isFinite(r) ? Math.min(height, burst.y + r) - y : height}>
      <Shader source={effect} uniforms={uniforms} />
    </Rect>
  );
}

/**
 * Builds a hit effect from your own shader. The library handles when it fires, where, the 0 to 1
 * animation, words and cleanup. See `ImpactEffectOptions.shader` for the uniforms it receives.
 */
export function createImpactEffect(options: ImpactEffectOptions): ComponentType<ImpactEffectProps> {
  const effect = compile(options.shader);
  const names = uniformNames(effect);
  const base = {
    words: options.words ?? false,
    colors: options.colors ?? { left: '#C6FF3D', right: '#3DD6FF' },
    size: options.size ?? 120,
    durationMs: options.durationMs ?? 560,
  };

  function Effect({
    on = 'both',
    sources,
    colors,
    words,
    wordStyle,
    size = base.size,
    durationMs = base.durationMs,
    speedLines,
    flash,
    ring,
    onImpact,
    level = 'auto',
  }: ImpactEffectProps) {
    const tier = LEVELS[useEffectLevel(level)];
    const [bursts, setBursts] = useState<Burst[]>([]);
    const { size: box, onLayout } = useLayoutSize();
    const nextId = useRef(0);
    const look: Look = {
      size,
      reach: tier.reach,
      durationMs,
      lines: (speedLines ?? tier.lines) ? 1 : 0,
      flash: (flash ?? tier.flash) ? 1 : 0,
      ring: (ring ?? tier.ring) ? 1 : 0,
    };
    const shownWords = words ?? (tier.words ? base.words : false);

    useBodyVisionEvents((event) => {
      let impact: Omit<Impact, 'color'> | null = null;
      if (event.type === 'repCompleted' && on !== 'hits') {
        const e = event as unknown as RepEvent;
        if (e.x !== undefined && e.y !== undefined) {
          impact = { x: e.x, y: e.y, side: e.side, source: e.exercise, kind: 'rep' };
        }
      } else if (event.type === 'targetHit' && on !== 'reps') {
        const e = event as unknown as TargetHitEvent;
        const side = e.joint.startsWith('right')
          ? 'right'
          : e.joint.startsWith('left')
            ? 'left'
            : undefined;
        impact = { x: e.x, y: e.y, side, source: e.target, kind: 'hit' };
      }
      if (!impact || (sources && !sources.includes(impact.source))) return;
      const color =
        impact.side === 'right'
          ? (colors?.right ?? base.colors.right)
          : (colors?.left ?? base.colors.left);
      const list = shownWords === false || shownWords.length === 0 ? null : shownWords;
      const burst: Burst = {
        ...impact,
        color,
        id: nextId.current++,
        seed: Math.random(),
        word: list ? list[Math.floor(Math.random() * list.length)] : null,
        tilt: (Math.random() - 0.5) * 30,
      };
      setBursts((current) => [...current.slice(1 - tier.bursts), burst]);
      onImpact?.({ ...impact, color });
    });

    const done = useCallback(
      (id: number) => setBursts((current) => current.filter((b) => b.id !== id)),
      []
    );

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
        <Canvas style={StyleSheet.absoluteFill}>
          {bursts.map((b) => (
            <Hit
              key={b.id}
              effect={effect}
              names={names}
              burst={b}
              look={look}
              width={box.width}
              height={box.height}
              onDone={done}
            />
          ))}
        </Canvas>
        {bursts.map((b) => {
          if (!b.word) return null;
          // Above the hit, or below it when that would leave the view.
          const above = b.y - size - 20;
          return (
            <Word
              key={b.id}
              text={b.word}
              x={b.x}
              y={above < 90 ? b.y + size * 0.7 : above}
              color={b.color}
              tilt={b.tilt}
              durationMs={durationMs}
              rise={options.risingWords}
              width={box.width}
              style={[options.wordStyle, wordStyle]}
            />
          );
        })}
      </View>
    );
  }
  return Effect;
}

export type ImpactLook = 'anime' | 'lightning' | 'fire' | 'pixel' | 'shatter' | 'jojo';

const LOOKS: Record<ImpactLook, ComponentType<ImpactEffectProps>> = {
  anime: createImpactEffect({
    shader: ANIME,
    words: ['POW!', 'BAM!', 'WHAM!', 'ドン!'],
    colors: { left: '#C6FF3D', right: '#3DD6FF' },
  }),
  lightning: createImpactEffect({
    shader: LIGHTNING,
    words: ['ZAP!', 'KRAK!', 'BZZT!'],
    colors: { left: '#7DF9FF', right: '#B18CFF' },
    durationMs: 480,
  }),
  fire: createImpactEffect({
    shader: FIRE,
    words: ['FWOOSH!', 'BURN!'],
    colors: { left: '#FF8A3D', right: '#FF3D6B' },
    durationMs: 700,
  }),
  pixel: createImpactEffect({
    shader: PIXEL,
    words: ['+1'],
    colors: { left: '#FFC23D', right: '#3DFF8A' },
    durationMs: 600,
    risingWords: true,
    wordStyle: { fontStyle: 'normal', fontFamily: 'Courier', fontSize: 36 },
  }),
  shatter: createImpactEffect({
    shader: SHATTER,
    words: ['CRACK!', 'SMASH!'],
    colors: { left: '#CFF4FF', right: '#FFE3F5' },
    durationMs: 800,
  }),
  jojo: createImpactEffect({
    shader: JOJO,
    words: ['ORA!', 'ORA ORA!', 'ドドド'],
    colors: { left: '#B14CFF', right: '#B14CFF' },
    size: 110,
    durationMs: 520,
  }),
};

/**
 * A hit effect at the moving joint or the hit target: every `mode: 'peak'` rep that carries a
 * position (e.g. `punch()`) and every target hit. Place it as a child of `BodyVisionView`.
 * Drawn with Skia shaders, animated on the UI thread.
 */
export function ImpactEffect({
  look = 'anime',
  ...props
}: ImpactEffectProps & { look?: ImpactLook }) {
  const Look = LOOKS[look];
  return <Look {...props} />;
}
