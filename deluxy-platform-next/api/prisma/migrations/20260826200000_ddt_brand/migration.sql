-- Il brand a cui appartiene il DDT/riferimento della vendita: con piu' negozi
-- lo stesso numero esiste su brand diversi e il numero da solo non identifica.
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "ddtBrand" TEXT;
