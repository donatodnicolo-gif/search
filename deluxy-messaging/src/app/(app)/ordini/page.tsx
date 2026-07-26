import { redirect } from 'next/navigation'

// Gli ordini sono la pagina iniziale (/). Questo indirizzo resta valido perché
// è quello registrato come URL dell'app su Shopify: reindirizza alla home.
export default function OrdiniLegacy() {
  redirect('/')
}
