-- La cache degli ordini impara l'id di Deluxy Orders (per linkare la sua
-- pagina dal pop-up) e il brand (per il filtro Brand della Finanza).
ALTER TABLE "OrdineCliente" ADD COLUMN "ordersId" TEXT;
ALTER TABLE "OrdineCliente" ADD COLUMN "brand" TEXT;
