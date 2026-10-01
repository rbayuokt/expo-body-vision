import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { color, space, type } from '../theme';

export function Label({ children, tint = color.muted }: { children: ReactNode; tint?: string }) {
  return <Text style={[type.label, { color: tint }]}>{children}</Text>;
}

/** Big tabular numeral for counts. */
export function Metric({
  value,
  label,
  size = 64,
  tint = color.text,
  testID,
}: {
  value: string;
  label: string;
  size?: number;
  tint?: string;
  testID?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text
        style={[styles.metricValue, { fontSize: size, lineHeight: size * 1.05, color: tint }]}
        testID={testID}>
        {value}
      </Text>
      <Label>{label}</Label>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [styles.primary, (pressed || disabled) && styles.pressed]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

/** Pill group. The selected option fills with lime. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  testIDPrefix?: string;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={styles.choice} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            testID={testIDPrefix ? `${testIDPrefix}-${o}` : undefined}
            style={[styles.choiceItem, selected && styles.choiceSelected]}>
            <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
              {labels?.[o] ?? o}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One connected bar for a single choice on a scale. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testIDPrefix: string;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            testID={`${testIDPrefix}-${o.id}`}
            style={[styles.segment, selected && styles.segmentSelected]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One column of the scoreboard. Every column is the same width and size, centered. */
export function Stat({
  value,
  label,
  tint,
  animated,
  testID,
}: {
  value: string | number;
  label: string;
  tint: string;
  animated?: AnimatedStyle<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={styles.stat}>
      <Animated.Text
        style={[styles.statValue, { color: tint }, animated]}
        numberOfLines={1}
        testID={testID}>
        {value}
      </Animated.Text>
      <Label>{label}</Label>
    </View>
  );
}

export function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowText}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: color.raised, true: color.lime }}
        thumbColor={value ? color.limeInk : color.muted}
        ios_backgroundColor={color.raised}
      />
    </View>
  );
}

export function Readout({
  label,
  value,
  tint = color.text,
  testID,
}: {
  label: string;
  value: string;
  tint?: string;
  testID?: string;
}) {
  return (
    <View style={styles.readout}>
      <Label>{label}</Label>
      <Text style={[styles.readoutValue, { color: tint }]} testID={testID} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function Chip({
  text,
  tint = color.lime,
  style,
}: {
  text: string;
  tint?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.chip, { borderColor: tint }, style]}>
      <Text style={[type.label, { color: tint, fontSize: 10 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metric: { alignItems: 'flex-start' },
  metricValue: { fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -2 },
  primary: {
    backgroundColor: color.lime,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  primaryText: { color: color.limeInk, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  ghost: {
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.raised,
  },
  ghostText: { color: color.text, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  choice: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  choiceItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  choiceSelected: { backgroundColor: color.lime, borderColor: color.lime },
  choiceText: { color: color.text, fontSize: 13, fontWeight: '600' },
  choiceTextSelected: { color: color.limeInk },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segmentSelected: { backgroundColor: color.lime },
  segmentText: { color: color.muted, fontSize: 13, fontWeight: '700' },
  segmentTextSelected: { color: color.limeInk },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { color: color.text, fontSize: 15, fontWeight: '500' },
  readout: { flex: 1, gap: 4, minWidth: 90 },
  readoutValue: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
});
