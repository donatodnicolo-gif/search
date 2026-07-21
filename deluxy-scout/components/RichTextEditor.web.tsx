// Editor rich text per il web (react-native-web). Un contentEditable con una
// toolbar: grassetto, corsivo, sottolineato, elenco puntato/numerato, link e un
// menu per inserire le variabili ([nome], [negozio]…). Il valore è HTML.
// Su nativo si usa il fallback in RichTextEditor.tsx (TextInput sul sorgente).
import { useEffect, useRef, useState } from 'react';
import { colors, radius, spacing } from '@/lib/theme';
import { VARIABILI_CONTATTO } from '@/lib/variabili';

interface Props {
  valueHtml: string;
  onChangeHtml: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const BTN: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  borderRadius: 6,
  width: 30,
  height: 28,
  fontSize: 14,
  color: 'var(--text, #1d1d1f)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function RichTextEditor({ valueHtml, onChangeHtml, placeholder, minHeight = 200 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [menuVar, setMenuVar] = useState(false);

  // Imposta l'HTML iniziale una sola volta (non ad ogni battuta, per non spostare il cursore).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== valueHtml) ref.current.innerHTML = valueHtml || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChangeHtml(ref.current?.innerHTML ?? '');

  function cmd(comando: string, valore?: string) {
    ref.current?.focus();
    document.execCommand(comando, false, valore);
    emit();
  }

  function inserisciLink() {
    const url = window.prompt('Indirizzo del link (https://…)');
    if (!url) return;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    cmd('createLink', href);
  }

  function inserisciVariabile(chiave: string) {
    ref.current?.focus();
    document.execCommand('insertText', false, `[${chiave}]`);
    setMenuVar(false);
    emit();
  }

  return (
    <div style={{ border: `1px solid ${colors.grigioChiaro}`, borderRadius: radius.md, background: colors.bianco, overflow: 'visible' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 6, borderBottom: `1px solid ${colors.grigioChiaro}`, flexWrap: 'wrap', position: 'relative' }}>
        <button type="button" title="Grassetto" style={{ ...BTN, fontWeight: 800 }} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')}>B</button>
        <button type="button" title="Corsivo" style={{ ...BTN, fontStyle: 'italic' }} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')}>I</button>
        <button type="button" title="Sottolineato" style={{ ...BTN, textDecoration: 'underline' }} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('underline')}>U</button>
        <span style={{ width: 1, height: 18, background: colors.grigioChiaro, margin: '0 4px' }} />
        <button type="button" title="Elenco puntato" style={BTN} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertUnorderedList')}>•≡</button>
        <button type="button" title="Elenco numerato" style={BTN} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertOrderedList')}>1≡</button>
        <button type="button" title="Link" style={BTN} onMouseDown={(e) => e.preventDefault()} onClick={inserisciLink}>🔗</button>
        <button type="button" title="Rimuovi formattazione" style={BTN} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('removeFormat')}>⌫</button>
        <span style={{ width: 1, height: 18, background: colors.grigioChiaro, margin: '0 4px' }} />
        <button
          type="button"
          title="Inserisci variabile"
          style={{ ...BTN, width: 'auto', paddingLeft: 8, paddingRight: 8, fontWeight: 600, color: colors.goldStrong }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setMenuVar((v) => !v)}
        >
          [ Variabile ]
        </button>
        {menuVar ? (
          <div style={{ position: 'absolute', top: 40, right: 6, background: colors.bianco, border: `1px solid ${colors.grigioChiaro}`, borderRadius: radius.md, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, minWidth: 220, padding: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.testoSoft, padding: '4px 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Del contatto</div>
            {VARIABILI_CONTATTO.map((v) => (
              <button key={v.chiave} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => inserisciVariabile(v.chiave)}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '7px 8px', borderRadius: 6, fontSize: 13, color: colors.testo }}>
                <b style={{ color: colors.goldStrong }}>[{v.chiave}]</b> — {v.label}
              </button>
            ))}
            <div style={{ height: 1, background: colors.grigioChiaro, margin: '4px 0' }} />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const k = window.prompt('Nome della variabile (es. data, evento)'); if (k?.trim()) inserisciVariabile(k.trim().toLowerCase()); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '7px 8px', borderRadius: 6, fontSize: 13, color: colors.testo }}>
              + Variabile personalizzata (la compili prima dell'invio)
            </button>
          </div>
        ) : null}
      </div>

      {/* Area editabile */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        data-placeholder={placeholder}
        style={{
          minHeight,
          padding: spacing.md,
          fontSize: 15,
          lineHeight: 1.5,
          color: colors.testo,
          outline: 'none',
          fontFamily: 'var(--font-sans)',
        }}
      />
      <style>{`[contenteditable][data-placeholder]:empty:before{content:attr(data-placeholder);color:${colors.grigio};} [contenteditable] a{color:${colors.goldStrong};}`}</style>
    </div>
  );
}
