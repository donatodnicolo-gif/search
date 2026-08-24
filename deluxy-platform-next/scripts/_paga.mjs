/**
 * Il plus della regola valet, dato il numero di ritiri del giro.
 *
 * Gli scaglioni si leggono in ordine e vince il piu' generoso che combacia:
 * nel legacy convivono `equal` (esattamente N ritiri) e `moreThan` (piu' di N),
 * e con 3 ritiri possono combaciare entrambi.
 */
export function plusRitiri(regola, ritiri) {
    if (!regola?.tiers || regola.active === false)
        return 0;
    let scaglioni;
    try {
        scaglioni = JSON.parse(regola.tiers);
    }
    catch {
        return 0;
    }
    if (!Array.isArray(scaglioni))
        return 0;
    let plus = 0;
    for (const s of scaglioni) {
        const n = Number(s.pickUps ?? 0);
        const p = Number(s.plusSalary ?? 0);
        if (!Number.isFinite(n) || !Number.isFinite(p))
            continue;
        const combacia = s.operator === 'moreThan' ? ritiri > n : ritiri === n;
        if (combacia && p > plus)
            plus = p;
    }
    return plus;
}
export function pagaConsegna(d, listino, regolaCarnet = null, regolaValet = null, ritiri = 0) {
    // Una regola carnet che dice «non pagare» vince su tutto.
    if (regolaCarnet && regolaCarnet.toPay === false)
        return null;
    const extra = (d.valetAdditionalPrice ?? 0)
        + (regolaCarnet?.valetPayAdjustment ?? 0)
        + plusRitiri(regolaValet, ritiri);
    const arrotonda = (n) => Math.round(n * 100) / 100;
    // Un minus non puo' trasformarsi in un debito del valet verso di noi.
    const mai_negativo = (n) => Math.max(0, arrotonda(n));
    // Quanto gli e' stato promesso quel giorno: e' un fatto, non una stima.
    if ((d.valetSalary ?? 0) > 0) {
        return { amount: mai_negativo(d.valetSalary + extra), origine: 'consegna' };
    }
    if (!listino)
        return null;
    // Il modello lo detta il servizio del VALET, non quello del partner: sono
    // due listini diversi sulla stessa consegna.
    const modello = listino.serviceType?.pricingModel ?? d.serviceType?.pricingModel ?? '';
    const perKm = (d.extraKm ?? 0) * (listino.extraKmPrice ?? 0);
    if (modello === 'A_ORA') {
        const oraria = listino.salary ?? 0;
        if (oraria <= 0)
            return null;
        const ore = Math.max(d.hours ?? 0, listino.serviceType?.minHours ?? d.serviceType?.minHours ?? 1);
        return { amount: mai_negativo(oraria * ore + perKm + extra), origine: 'listino' };
    }
    if (modello === 'MAGAZZINO') {
        const aPezzo = listino.salaryPerItem ?? 0;
        const pezzi = (d.products ?? []).reduce((s, p) => s + (p.quantity ?? 1), 0);
        const totale = (listino.salary ?? 0) + aPezzo * pezzi;
        if (totale <= 0)
            return null;
        return { amount: mai_negativo(totale + perKm + extra), origine: 'listino' };
    }
    const fissa = listino.salary ?? 0;
    if (fissa <= 0)
        return null;
    return { amount: mai_negativo(fissa + perKm + extra), origine: 'listino' };
}
