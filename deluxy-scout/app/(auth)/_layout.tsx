import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Loader } from '../_layout';

export default function AuthLayout() {
  const { session, loading } = useAuth();
  if (loading) return <Loader />;
  // Se già autenticato, non mostrare il login.
  if (session) return <Redirect href="/(app)/mappa" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
