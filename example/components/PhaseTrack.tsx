import { StyleSheet, Text, View } from 'react-native';

import { color, type } from '../theme';

const STEPS = ['top', 'descending', 'bottom', 'ascending'] as const;
const LABELS: Record<(typeof STEPS)[number], string> = {
  top: 'Top',
  descending: 'Down',
  bottom: 'Bottom',
  ascending: 'Up',
};

/** The rep cycle as four segments. The current phase is lit. */
export function PhaseTrack({ phase }: { phase: string }) {
  return (
    <View style={styles.track} accessibilityLabel={`Phase ${phase}`}>
      {STEPS.map((s) => {
        const on = s === phase;
        return (
          <View key={s} style={styles.step}>
            <View style={[styles.bar, on && styles.barOn]} />
            <Text style={[type.label, { color: on ? color.lime : color.faint, fontSize: 10 }]}>
              {LABELS[s]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, gap: 6 },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.raised },
  barOn: { backgroundColor: color.lime },
});
