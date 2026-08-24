export function prezzoConsegna(d, listino) {
    const extra = d.additionalPrice ?? 0;
    const arrotonda = (n) => Math.round(n * 100) / 100;
    // Il prezzo deciso sulla consegna vince: è un fatto, non una stima.
    if ((d.price ?? 0) > 0) {
        return { amount: arrotonda(d.price + extra), origine: 'consegna', modello: d.serviceType?.pricingModel ?? '—' };
    }
    const modello = d.serviceType?.pricingModel ?? '';
    const valoreProdotti = (d.products ?? []).reduce((s, p) => s + (p.price ?? 0) * (p.quantity ?? 1), 0);
    // Km oltre quelli inclusi: vale solo dove si paga la distanza.
    const supplementoKm = () => {
        if (!listino)
            return 0;
        const inclusi = listino.includedKm ?? 0;
        const percorsi = d.distanceKm ?? 0;
        const oltre = d.extraKm && d.extraKm > 0 ? d.extraKm : Math.max(0, percorsi - inclusi);
        const perKm = oltre * (listino.extraKmPrice ?? 0);
        const fuori = d.extraOutOfCity ? (listino.extraOutOfCityPrice ?? 0) : 0;
        return perKm + fuori;
    };
    switch (modello) {
        case 'PREZZO_FISSO': {
            const tariffa = listino?.price ?? d.serviceType?.basePrice ?? 0;
            if (tariffa <= 0)
                return null;
            return { amount: arrotonda(tariffa + supplementoKm() + extra), origine: 'listino', modello };
        }
        case 'A_ORA': {
            const tariffa = listino?.price ?? 0;
            if (tariffa <= 0)
                return null;
            // Il minimo di ore del servizio: mezz'ora di lavoro non si fattura mezza.
            const ore = Math.max(d.hours ?? 0, d.serviceType?.minHours ?? 1);
            return { amount: arrotonda(tariffa * ore + supplementoKm() + extra), origine: 'listino', modello };
        }
        case 'MAGAZZINO': {
            const base = listino?.price ?? d.serviceType?.basePrice ?? 0;
            const aPezzo = listino?.pricePerItem ?? d.serviceType?.perPiecePrice ?? 0;
            const pezzi = (d.products ?? []).reduce((s, p) => s + (p.quantity ?? 1), 0);
            const totale = base + aPezzo * pezzi;
            if (totale <= 0)
                return null;
            return { amount: arrotonda(totale + extra), origine: 'listino', modello };
        }
        case 'VENDITA': {
            // ⚠️ `listino.price` qui e' una PERCENTUALE, non euro.
            const feePercento = listino?.price ?? 0;
            if (feePercento <= 0 || valoreProdotti <= 0)
                return null;
            return { amount: arrotonda((valoreProdotti * feePercento) / 100 + extra), origine: 'listino', modello };
        }
        case 'CORPORATE': {
            if (valoreProdotti <= 0)
                return null;
            return { amount: arrotonda(valoreProdotti + extra), origine: 'listino', modello };
        }
        default:
            return null;
    }
}
