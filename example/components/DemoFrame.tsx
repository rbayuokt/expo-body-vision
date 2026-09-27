import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, space, type } from '../theme';

const HudInsetContext = createContext({ top: 0, bottom: 0 });

/** Space taken by the frame's chrome over the camera, for overlays that must stay visible. */
export function useHudInset() {
  return useContext(HudInsetContext);
}

/** Full-bleed camera with floating chrome and a HUD sheet at the bottom. */
export function DemoFrame({
  title,
  tag,
  onBack,
  camera,
  hud,
  overlay,
  foreground,
}: {
  title: string;
  tag: string;
  onBack: () => void;
  camera: ReactNode;
  hud?: ReactNode;
  /** Centered over the camera, e.g. a big status word. */
  overlay?: ReactNode;
  /** Drawn over everything including the HUD, never touchable (e.g. an edge glow). */
  foreground?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Landscape: the HUD becomes a side column so the camera keeps the full height.
  const landscape = width > height;
  const side = Math.min(360, width * 0.38);
  const [hudHeight, setHudHeight] = useState(0);
  const inset = {
    top: insets.top + 56,
    bottom: landscape || !hud ? insets.bottom : hudHeight,
  };
  return (
    <View style={styles.root}>
      {/* In landscape the camera ends at the side panel, so readiness centering and the body
          never sit behind it. */}
      <View
        style={[StyleSheet.absoluteFill, landscape && hud ? { right: side + insets.right } : null]}>
        <HudInsetContext.Provider value={inset}>{camera}</HudInsetContext.Provider>
      </View>
      <View
        style={[
          styles.top,
          { paddingTop: insets.top + space.sm, paddingLeft: insets.left + space.lg },
          landscape && hud ? { right: side } : null,
        ]}
        pointerEvents="box-none">
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={styles.back}
          testID="back"
          accessibilityRole="button"
          accessibilityLabel="Back">
          <View style={styles.chevron} />
        </Pressable>
        {/* Left-aligned in landscape so the title doesn't sit on the user's head. */}
        <View style={[styles.titleWrap, landscape && styles.titleSide]}>
          <Text style={[type.label, styles.tag]}>{tag}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.backSpacer} />
      </View>
      {overlay ? (
        <View style={styles.overlay} pointerEvents="none">
          {overlay}
        </View>
      ) : null}
      {hud && !landscape ? (
        <View
          style={[styles.hud, { paddingBottom: insets.bottom + space.lg }]}
          onLayout={(e) => setHudHeight(e.nativeEvent.layout.height)}>
          {hud}
        </View>
      ) : null}
      {hud && landscape ? (
        <View style={[styles.sideHud, { width: side + insets.right }]}>
          <ScrollView
            contentContainerStyle={[
              styles.sideContent,
              {
                paddingTop: insets.top + space.xl,
                paddingBottom: insets.bottom + space.xl,
                paddingRight: insets.right + space.xl,
              },
            ]}>
            {hud}
          </ScrollView>
        </View>
      ) : null}
      {foreground ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {foreground}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Two borders of a square turned 45 degrees. Nudged right so it sits optically centred.
  chevron: {
    width: 12,
    height: 12,
    marginLeft: 4,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: color.text,
    borderBottomLeftRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  backSpacer: { width: 44 },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  titleSide: { alignItems: 'flex-start', marginLeft: space.md },
  tag: { color: color.lime, fontSize: 10 },
  title: {
    color: color.text,
    fontSize: 17,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  sideHud: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.panel,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    borderLeftWidth: 1,
    borderColor: color.hairline,
  },
  sideContent: { paddingLeft: space.xl, gap: space.lg },
  hud: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: color.hairline,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    gap: space.lg,
  },
});
