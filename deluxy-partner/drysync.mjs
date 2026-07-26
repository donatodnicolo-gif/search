import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function go(fn){for(let i=0;i<5;i++){try{return await fn();}catch(e){if(i===4)throw e;await new Promise(r=>setTimeout(r,1500));}}}
const url=process.env.ORDERS_URL, key=process.env.ORDERS_API_KEY;
const dal=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
let pag=1, ordini=[];
while(pag<=50){ const r=await fetch(`${url}/api/v1/ordini?limit=200&page=${pag}&da=${dal}`,{headers:{"x-api-key":key}}); const j=await r.json(); ordini.push(...(j.ordini||[])); if(!j.ordini?.length||pag>=j.pagine)break; pag++; }
console.log("ordini registro ultimi 90gg:",ordini.length);
const neg=await go(()=>prisma.negozioShopify.findMany({select:{id:true,brand:true}}));
const perBrand=new Map(neg.map(n=>[n.brand,n.id]));
let esistono=0,nuovi=0,brandMancante=0;
for(const o of ordini){ const nid=perBrand.get(o.brand); if(!nid){brandMancante++;continue;} const e=await go(()=>prisma.ordineShopify.findUnique({where:{negozioId_orderId:{negozioId:nid,orderId:o.orderId}}, select:{id:true}})); if(e)esistono++; else nuovi++; }
console.log("=> gia in FINANCE (update):",esistono,"· nuovi (create):",nuovi,"· brand non mappato:",brandMancante);
await prisma.$disconnect();
