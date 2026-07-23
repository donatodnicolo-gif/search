import { formattaData } from "@/lib/dominio";

// Data di scadenza con evidenza: rossa se passata, arancio se entro 3 giorni.
export function Scadenza({ data, chiusa }: { data: Date | null; chiusa?: boolean }) {
  if (!data) return <span className="cella-muta">—</span>;
  if (chiusa) return <span className="cella-muta">{formattaData(data)}</span>;
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const giorni = Math.floor((data.getTime() - oggi.getTime()) / 86_400_000);
  const classe = giorni < 0 ? "scaduta" : giorni <= 3 ? "in-scadenza" : "";
  return <span className={classe}>{formattaData(data)}</span>;
}
