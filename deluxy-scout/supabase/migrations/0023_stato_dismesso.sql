-- Allinea gli stati affiliazione al registro Deluxy Anagrafiche: aggiunge 'dismesso'
-- (8° stato del registro). ALTER TYPE ... ADD VALUE non può stare in transazione.
alter type stato_affiliazione_t add value if not exists 'dismesso';
