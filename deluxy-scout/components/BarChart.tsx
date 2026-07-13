import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { colors, radius, spacing } from '@/lib/theme';

export interface BarDatum {
  label: string;
  value: number;
}

/** Bar chart semplice e leggibile su mobile (react-native-svg). */
export function BarChart({
  titolo,
  data,
  height = 180,
}: {
  titolo: string;
  data: BarDatum[];
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const larghezza = 320;
  const padBottom = 28;
  const padTop = 8;
  const gap = 12;
  const barW = data.length > 0 ? (larghezza - gap * (data.length + 1)) / data.length : 0;
  const areaH = height - padBottom - padTop;

  return (
    <View style={styles.card}>
      <Text style={styles.titolo}>{titolo}</Text>
      {data.length === 0 ? (
        <Text style={styles.vuoto}>Nessun dato</Text>
      ) : (
        <Svg width="100%" height={height} viewBox={`0 0 ${larghezza} ${height}`}>
          {data.map((d, i) => {
            const h = (d.value / max) * areaH;
            const x = gap + i * (barW + gap);
            const y = padTop + (areaH - h);
            return (
              <Rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={4}
                fill={i % 2 === 0 ? colors.navy : colors.oro}
              />
            );
          })}
          {data.map((d, i) => {
            const x = gap + i * (barW + gap) + barW / 2;
            const h = (d.value / max) * areaH;
            const y = padTop + (areaH - h);
            return (
              <SvgText key={`v${i}`} x={x} y={y - 4} fontSize={11} fontWeight="700" fill={colors.navy} textAnchor="middle">
                {d.value}
              </SvgText>
            );
          })}
          {data.map((d, i) => {
            const x = gap + i * (barW + gap) + barW / 2;
            return (
              <SvgText key={`l${i}`} x={x} y={height - 10} fontSize={10} fill={colors.testoSoft} textAnchor="middle">
                {d.label.length > 10 ? d.label.slice(0, 9) + '…' : d.label}
              </SvgText>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bianco,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.grigioChiaro,
  },
  titolo: { fontSize: 15, fontWeight: '800', color: colors.navy, marginBottom: spacing.sm },
  vuoto: { color: colors.grigio, fontStyle: 'italic', paddingVertical: spacing.lg, textAlign: 'center' },
});
