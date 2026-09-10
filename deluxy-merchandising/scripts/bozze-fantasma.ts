// Le bozze fantasma lasciate dall'autosalvataggio: hanno il testo ma niente
// prezzo, varianti, foto e pubblicazioni. Non si cancella niente: si elenca.
import { caricaEnv } from "./vecchio-gestionale";
async function main(){caricaEnv();const {prisma}=await import("../src/lib/db");
const da=new Date("2026-09-09T15:00:00Z"); // da quando l'autosalvataggio è vivo
const p=await prisma.prodotto.findMany({where:{creatoIl:{gte:da},fase:"concept",tipologiaVendita:null,prezzoVendita:0},
  select:{id:true,codice:true,nome:true,creatoIl:true,_count:{select:{varianti:true,media:true,pubblicazioni:true}}},
  orderBy:{creatoIl:"asc"}});
const fantasmi=p.filter((x) =>x._count.varianti===0&&x._count.media===0&&x._count.pubblicazioni===0);
console.log(`bozze nate dall'autosalvataggio (concept, senza classificazione, prezzo 0): ${p.length}`);
console.log(`di cui SENZA varianti, foto e pubblicazioni — i fantasmi: ${fantasmi.length}\n`);
for(const x of fantasmi) console.log(`  ${x.creatoIl.toISOString().slice(0,16)}  ${(x.codice??"").padEnd(10)} ${x.nome.slice(0,50)}`);
console.log("\nNon è stato cancellato niente: decidi tu se archiviarle.");
await prisma.$disconnect();}
main().catch(e=>{console.error(String(e).split("\n")[0]);process.exit(1)});
