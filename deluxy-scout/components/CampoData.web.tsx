// CAMPO DATA — versione WEB: apre il calendario vero del browser.
//
// È un `<input type="date">` del DOM, non un TextInput: react-native-web
// disegna con react-dom, quindi gli elementi veri si possono usare (stessa
// strada di RichTextEditor.web.tsx). Un calendario scritto a mano sarebbe
// centinaia di righe che nessuno mantiene, e perderebbe quello che il browser
// dà gratis: tastiera, lettori di schermo, formato locale (in italiano si
// legge gg/mm/aaaa) e il calendario del sistema operativo.
//
// ⚠️ Il valore resta sempre `AAAA-MM-GG`, che è ciò che l'input vuole in
// `value` e ciò che il database salva in una colonna `date`: la traduzione in
// «15/09/2026» la fa il browser da solo, e non passa mai dal nostro codice.
import { useRef, useState } from 'react';
import { colors, radius, spacing } from '@/lib/theme';
import type { CampoDataProps } from './CampoData';

export function CampoData({ valore, onCambia, placeholder }: CampoDataProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [attivo, setAttivo] = useState(false);

  return (
    <div style={RIGA}>
      <input
        ref={ref}
        type="date"
        value={valore ?? ''}
        onChange={(e) => onCambia(e.target.value || null)}
        onFocus={() => setAttivo(true)}
        onBlur={() => setAttivo(false)}
        // Il campo intero apre il calendario, non solo l'icona: cliccare la
        // parte sinistra e non veder succedere niente sembra un campo rotto.
        // `showPicker` non c'è su tutti i browser, quindi si prova e basta.
        onClick={() => {
          try {
            (ref.current as any)?.showPicker?.();
          } catch {
            /* Firefox lo rifiuta fuori da un gesto diretto: pazienza, resta l'icona. */
          }
        }}
        aria-label={placeholder ? `Data — ${placeholder}` : 'Data'}
        style={{ ...INPUT, borderColor: attivo ? colors.ink : colors.grigioChiaro }}
      />
      {/* Il campo è facoltativo, quindi ci deve essere un modo di svuotarlo:
          l'input date non offre una × in tutti i browser, e senza questo una
          data messa per sbaglio non si toglieva più. */}
      {valore ? (
        <button type="button" onClick={() => onCambia(null)} style={TOGLI}>
          Togli la data
        </button>
      ) : null}
    </div>
  );
}

const RIGA: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing.sm };

const INPUT: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  // ⚠️ Altezza fissata a mano: un `input[type=date]` porta dentro i suoi
  // widget (le tre caselle e l'icona del calendario) e ha un'altezza minima
  // sua, che con gli stessi padding lo faceva venire **43px contro i 41** degli
  // altri campi. Misurato, non stimato: 10+10 di padding, 2 di bordo e 19 di
  // riga. Se un domani cambiano i padding del design system, va rifatto il
  // conto qui.
  height: 41,
  backgroundColor: colors.bianco,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: radius.m,
  paddingLeft: spacing.lg,
  paddingRight: spacing.sm,
  paddingTop: 10,
  paddingBottom: 10,
  fontSize: 14,
  color: colors.testo,
  fontFamily: 'inherit',
  outline: 'none',
  cursor: 'pointer',
};

const TOGLI: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: colors.navy,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
};
