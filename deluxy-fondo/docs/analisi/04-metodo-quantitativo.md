# Analisi 4 di 5 — Metodo quantitativo (quant long/short)

> Prodotta da un agente indipendente. Non verificata su dati reali: le soglie numeriche
> sono di progettazione, da ricalibrare sul campione vero.

## Definizioni operative

**Cosa conta come evento.** Quattro tier, ordinati per contenuto informativo (la letteratura sul CEO turnover è chiara: conta *forzato + successore esterno*, non la successione ordinata):

- **T1 (peso evento 1.0)** — cambio dell'azionista di controllo / OPA / vittoria di una lista di minoranza in assemblea / ingresso di un attivista sopra soglia di trasparenza (Consob 3-5%, dichiarazione 120b TUF).
- **T2 (0.8)** — uscita forzata del CEO (dimissioni non programmate, revoca, uscita entro 30 gg da profit warning o da bocciatura del piano) **con** successore esterno al gruppo.
- **T3 (0.5)** — cambio CEO con successore interno, o rinnovo di oltre metà del CdA.
- **T4 (0.3)** — CFO o COO, singoli consiglieri, presidente non esecutivo.

**Datazione.** Si registrano sempre tre date distinte: `t_rumor` (prima menzione credibile in stampa primaria), `t_ann` (comunicato ufficiale/deposito lista), `t_eff` (efficacia: assemblea, cooptazione). L'evento primario è `t_ann`; `t_rumor` e `t_eff` entrano nei test di robustezza. **Perché cambia i risultati**: se il mercato ha prezzato il leak, il CAR misurato su `t_ann` è attenuato verso zero e si conclude "non funziona" quando in realtà non era investibile; se si misura su `t_rumor` si cattura un rendimento non catturabile. Regola di investibilità: l'ingresso nel backtest avviene alla **chiusura del primo giorno di negoziazione successivo all'annuncio pubblico**, mai al close di `t0`.

**Misura.** Market model stimato su [-250, -30] rispetto a `t0` (minimo 120 osservazioni valide, altrimenti evento scartato). Due specifiche in parallelo: (1) un fattore, FTSE MIB; (2) **due fattori, mercato + STOXX Europe 600 Telecommunications**. La seconda è quella che conta per un long/short: l'alpha idiosincratica, non il beta settoriale. CAR su [-1,+1], [0,+5], [0,+20]. Per l'orizzonte lungo **non si usa il BHAR grezzo** (distribuzione asimmetrica, t-stat gonfiati, correlazione incrociata): si usa un **calendar-time portfolio** equal-weight dei nomi in finestra 6/12/24 mesi, con alpha di Carhart a 4 fattori — risolve anche le sovrapposizioni.

**Sovrapposizioni e contaminazione.** Due eventi sullo stesso emittente entro 60 gg si fondono nel tier più alto. Se nella finestra [-2,+2] cadono risultati, M&A, aumento di capitale o guidance, l'evento è flaggato *contaminato* ed esce dal campione principale. Per gli errori standard cross-sectional: Kolari-Pynnönen (BMP aggiustato), mai t-test naïf su eventi in cluster settoriale.

## Formula dello score

Ogni sotto-variabile è un **percentile cross-sezionale sul peer set** (winsorizzato 5/95), non uno z-score assoluto: rende comparabili settori e periodi e impedisce a un outlier di dominare.

```python
PESI = {"evento": 30, "fondamentali": 25, "valutazione": 20, "momentum": 15, "sentiment": 10}

SUB = {
 "evento":       {"tier": .40, "successore_esterno": .20, "forzato": .15,
                  "skin_in_the_game": .10,   # acquisti del nuovo mgmt sul mercato
                  "piano_con_target_datati": .15},
 "fondamentali": {"nd_ebitdaal_inv": .30, "fcf_yield_post_lease": .25,
                  "trend_margine_ebitda_4q": .20,
                  "asset_cedibili_su_ev": .15, "coverage_interessi": .10},
 "valutazione":  {"ev_ebitdaal_vs_storico5y": .40, "ev_ebitdaal_vs_peer": .35,
                  "p_b_vs_storico": .25},
 "momentum":     {"rel_ret_6m_ex1m_vs_settore": .50, "dist_ma200": .25,
                  "revisioni_eps_3m": .25},
 "sentiment":    {"tono_news_90g": .60, "dispersione_target_price": .40},
}

def blocco(valori, pesi, max_stale_giorni=200):
    num = den = 0.0
    for k, w in pesi.items():
        v = valori.get(k)
        if v is None or v.stale_giorni > max_stale_giorni:
            continue                     # ESCLUSA: non vale zero
        num += w * percentile_peer(v); den += w
    return (num/den if den > 0 else None), den   # den = copertura del blocco

def score(azienda):
    num = den = 0.0; dettaglio = {}
    for blocco_nome, w in PESI.items():
        s, cov = blocco(azienda[blocco_nome], SUB[blocco_nome])
        dettaglio[blocco_nome] = (s, cov)
        if s is None: continue
        w_eff = w * cov                  # rinormalizzazione proporzionale
        num += w_eff * s; den += w_eff
    copertura = den / 100.0
    if copertura < 0.50:
        return {"score": None, "esito": "da valutare",
                "copertura": copertura, "dettaglio": dettaglio}
    return {"score": num/den, "copertura": copertura, "dettaglio": dettaglio,
            "ic95": bootstrap_ci(azienda)}   # mai un numero secco
```

**Nota anti-p-hacking sui pesi**: i pesi sono fissati *a priori* per ragionamento economico e **non ottimizzati sui dati**. Con n<100 eventi, ottimizzare i pesi è overfitting per costruzione. Va invece mostrata la sensitività: se muovendo ogni peso di ±50% il ranking dei nomi cambia radicalmente, lo score non è informativo. Il blocco *sentiment* entra a peso 0 nel backtest se non esiste un archivio news point-in-time.

## Regole di uscita

```python
def esci(pos, mkt, tesi):
    # 1. stop assoluto e RELATIVO (per un long/short conta il secondo)
    if pos.ret_close <= -0.20: return "stop_assoluto"
    if pos.ret_rel_settore <= -0.12: return "stop_relativo"
    # valutati su chiusura, non intraday: evita gap-fill fittizi nel backtest

    # 2. trailing, attivo solo dopo un guadagno reale
    if pos.max_ret_close >= 0.25 and pos.ret_close <= pos.max_ret_close - 0.15:
        return "trailing"

    # 3. target di valutazione: uscita a scaglioni, non tutto-o-niente
    if pos.ev_ebitdaal >= peer_median:      return "riduci_1/3"
    if pos.ev_ebitdaal >= media5y + 0.5*sd: return "riduci_2/3"
    if pos.ev_ebitdaal >= peer_p75:         return "chiudi"

    # 4. tesi invalidata -> uscita entro 5 sedute, indipendentemente dal P&L
    if tesi.ceo_o_cfo_chiave_esce:                 return "tesi_persona"
    if tesi.piano_ritirato or tesi.target_rinviato_2q: return "tesi_piano"
    if tesi.cessione_chiave_saltata:               return "tesi_asset"
    if tesi.leva_sale_2q_consecutivi:              return "tesi_leva"
    if tesi.aumento_capitale_diluitivo_non_previsto: return "tesi_equity"

    # 5. tempo + revisione obbligatoria
    if pos.mesi >= 12 and score_oggi(pos) < SOGLIA_INGRESSO: return "non_ricomprerei"
    if pos.mesi >= 24: return "tempo_massimo"
```

Vincolo di size: posizione ≤ 10% dell'ADV a 20 giorni, uscita completa in ≤ 5 sedute. Se non è vero, la posizione non si apre.

## Cosa può invalidare tutto questo

- **Survivorship bias**: se l'universo parte dagli emittenti quotati *oggi*, mancano i delistati, le OPA e i dissesti — e i turnaround falliti sono proprio la coda che uccide la strategia. Serve un universo storico con ISIN morti.
- **Look-ahead sui bilanci**: il bilancio al 31/12 è noto solo alla data di pubblicazione (spesso marzo). Usare la data di chiusura esercizio gonfia sistematicamente i risultati. Serve un archivio *point-in-time* con `data_pubblicazione`.
- **Restatement**: i vendor sovrascrivono i dati rivisti. Serve *as-first-reported*, altrimenti si sta usando un'informazione che nessuno aveva.
- **Ticker/ISIN, spin-off, dividendi straordinari, raggruppamenti**: serie prezzi total-return correttamente aggiustate, o il momentum è spazzatura.
- **Costi reali**: spread 10-40 bps sulle mid-cap italiane, impatto, e soprattutto **costo del prestito titoli sulla gamba short** — i nomi in crisi sono hard-to-borrow e possono costare 200-1000 bps annui. Molto "alpha" scompare qui.
- **Numerosità**: con CAR atteso 3% e σ 12%, servono ~64 eventi per un t≈2; su BHAR 12m (σ~35%, effetto 10%) ne servono ~50 non sovrapposti. Nel telecom europeo in vent'anni non ci sono. Delle due l'una: si allarga a Europa multi-settore con dummy di settore, oppure **non si può affermare nulla di statistico**.
- **Multiple testing**: dichiarare quante specifiche (finestre, benchmark, tier) sono state provate e applicare Holm o FDR; riportare lo Sharpe deflazionato. La specifica va pre-registrata prima di guardare i risultati.
- **n=1 (TIM)**: un singolo caso non è evidenza, è aneddoto. Qualunque CAR su un evento è indistinguibile dal rumore. Se la tesi regge solo su TIM, è una storia, non una strategia.
- **Validazione onesta con pochi eventi**: split temporale (train / test / holdout post-2022), walk-forward *senza* ri-ottimizzare i pesi; **placebo** (date casuali sullo stesso titolo; portafoglio matched su stessi fondamentali *senza* cambio di management — se rende uguale, l'alpha è deep-value, non "change of management"; shuffle delle etichette); **bootstrap a blocchi** sui rendimenti e cross-sezionale sugli eventi, riportando **mediana e hit-rate**, non solo la media (dominata da 1-2 vincitori). Soglia minima prima di denaro reale: ≥40 eventi indipendenti out-of-sample, alpha vs settore con IC 95% che esclude lo zero **dopo costi e borrow**, mediana>0, robustezza a ±50% sui pesi, più ≥6 mesi di paper trading con lo stesso codice di produzione. Sotto questa soglia: solo size di ricerca (≤0.5% NAV).

## Requisiti per l'app

Deve **calcolare**: CAR/AR su tre finestre con market model e modello a 2 fattori; calendar-time alpha; score con rinormalizzazione; costi stimati (spread + impatto + borrow) sottratti prima di mostrare qualunque rendimento.

Deve **mostrare come incertezza**, in modo non nascondibile: la **copertura dati** in percentuale accanto a ogni score; la dicitura **"da valutare"** (nessun numero) sotto il 50%; l'**intervallo di confidenza bootstrap** invece del numero secco; il **numero di eventi** su cui poggia ogni statistica, con avviso esplicito sotto 30; la **data di pubblicazione** e l'età di ogni dato di bilancio usato; il flag *contaminato* sugli eventi; il badge *point-in-time / as-first-reported*; il log immutabile dello snapshot dati usato per ogni decisione, per l'audit ex-post. Nessuna metrica dedotta da testo libero: se il dato non c'è, si scrive che non c'è.
