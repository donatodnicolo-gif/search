import { Glossario } from '@/components/Glossario'

export const dynamic = 'force-dynamic'

// Il glossario: i fatti che servono a chi risponde a un cliente.
//
// ⚠️ Lo vedono tutti gli operatori, non solo gli amministratori: è materiale di
// lavoro, e un glossario che vede solo chi amministra non lo legge nessuno.
export default function PaginaGlossario() {
  return <Glossario />
}
