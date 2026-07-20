// Icona line-art della tipologia di interesse (linea Deluxy).
import { Ionicons } from '@expo/vector-icons';
import { iconaLineaNome } from '@/lib/theme';

export function LineaIcon({
  linea,
  size = 22,
  color,
}: {
  linea: string | null | undefined;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={iconaLineaNome(linea) as never} size={size} color={color} />;
}
