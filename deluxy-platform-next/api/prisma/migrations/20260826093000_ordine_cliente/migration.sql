-- Cache di quello che il CLIENTE ha pagato online (prodotti + consegna), per
-- ordine Shopify: i margini della Finanza contano il prezzo del cliente,
-- le consegne mostrano quello del partner.
CREATE TABLE "OrdineCliente" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "numero" TEXT,
    "prodotti" DOUBLE PRECISION NOT NULL,
    "consegna" DOUBLE PRECISION NOT NULL,
    "totale" DOUBLE PRECISION NOT NULL,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdineCliente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrdineCliente_orderId_key" ON "OrdineCliente"("orderId");
