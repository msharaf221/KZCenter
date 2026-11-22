import { Activity, LayoutDashboard, Settings2 } from 'lucide-react-native';
import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { LoadingScreen } from '../../src/components/Shared';
import { useAuth } from '../../src/contexts/AuthContext';
import { OwnerLiveProvider } from '../../src/contexts/OwnerLiveContext';
import { theme } from '../../src/theme';

export default function TabsLayout() {
  const { session, membership, loading } = useAuth();
  if (loading) return <LoadingScreen label="جارٍ التحقق من صلاحية المالك" />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!membership || membership.role !== 'owner') return <Redirect href="/access-denied" />;

  return (
    <OwnerLiveProvider>
      <Tabs screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarHideOnKeyboard: true,
      }}>
        <Tabs.Screen name="index" options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={LayoutDashboard} color={String(color)} focused={focused} />,
        }} />
        <Tabs.Screen name="activity" options={{
          title: 'النشاط',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Activity} color={String(color)} focused={focused} />,
        }} />
        <Tabs.Screen name="settings" options={{
          title: 'الحساب',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Settings2} color={String(color)} focused={focused} />,
        }} />
      </Tabs>
    </OwnerLiveProvider>
  );
}

function TabIcon({ Icon, color, focused }: { Icon: typeof Activity; color: string; focused: boolean }) {
  return (
    <View style={[styles.iconFrame, focused && styles.iconFrameFocused]}>
      <Icon size={19} color={focused ? theme.colors.primary : color} strokeWidth={focused ? 2.4 : 2} />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: Platform.OS === 'ios' ? 82 : 70,
    paddingTop: 7,
    paddingBottom: Platform.OS === 'ios' ? 18 : 7,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    elevation: 12,
    direction: 'rtl',
  },
  tabLabel: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  tabItem: { paddingTop: 1 },
  iconFrame: { minWidth: 38, height: 27, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconFrameFocused: { backgroundColor: theme.colors.primarySoft },
});
