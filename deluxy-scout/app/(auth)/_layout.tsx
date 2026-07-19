import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Loader } from '../_layout';

export default function AuthLayout() {
  const { session, loading } = useAuth();
  if (loading) return <Loader />;
  // Se già autenticato, vai alla schermata di default (tasklist).
  if (session) return <Redirect href="/(app)/task" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
