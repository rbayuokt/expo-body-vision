import { StyleSheet, Text, View } from 'react-native';

import { color, space } from '../theme';
import { useHudInset } from './DemoFrame';

/**
 * A pill under the header, so status never sits on the body. `filled` turns the whole pill into
 * the dot color, for states that should stand out like a held pose.
 */
export function StatusPill({
  text,
  dot = color.muted,
  filled,
  testID,
}: {
  text: string;
  dot?: string;
  filled?: boolean;
  testID?: string;
}) {
  const inset = useHudInset();
  return (
    <View style={[styles.wrap, { top: inset.top + space.sm }]} pointerEvents="none">
      <View style={[styles.pill, filled && { backgroundColor: dot, borderColor: dot }]}>
        <View style={[styles.dot, { backgroundColor: filled ? color.limeInk : dot }]} />
        <Text style={[styles.text, filled && { color: color.limeInk }]} testID={testID}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 999,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { color: color.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
