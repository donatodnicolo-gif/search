import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Loader } from './_layout';

// Punto d'ingresso: instrada in base alla sessione.
export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return <Loader />;
  return <Redirect href={session ? '/(app)/mappa' : '/(auth)/login'} />;
}
