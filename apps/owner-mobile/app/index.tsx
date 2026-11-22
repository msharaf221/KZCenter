import { Redirect } from 'expo-router';
import { LoadingScreen } from '../src/components/Shared';
import { useAuth } from '../src/contexts/AuthContext';

export default function IndexRoute() {
  const { session, membership, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!membership || membership.role !== 'owner') return <Redirect href="/access-denied" />;
  return <Redirect href="/(tabs)" />;
}
