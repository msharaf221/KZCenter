import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, Check, ChevronLeft, CircleHelp, Clock3, LockKeyhole, LogOut, RefreshCw, ShieldCheck, Smartphone, Wifi } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LiveIndicator, SurfaceCard } from '../../src/components/Shared';
import { useAuth } from '../../src/contexts/AuthContext';
import { useOwnerLiveData } from '../../src/contexts/OwnerLiveContext';
import { formatSnapshotTime } from '../../src/lib/format';
import { theme } from '../../src/theme';

export default function AccountScreen() {
  const router = useRouter();
  const { session, membership, signOut } = useAuth();
  const { snapshot, status, refreshing, refresh } = useOwnerLiveData();
  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد إنهاء جلسة المالك على هذا الجهاز؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تسجيل الخروج', style: 'destructive', onPress: () => {
        setSigningOut(true);
        void signOut().then(() => router.replace('/sign-in')).catch(() => {
          Alert.alert('تعذّر تسجيل الخروج', 'تحقق من الاتصال وحاول مرة أخرى.');
        }).finally(() => setSigningOut(false));
      } },
    ]);
  };

  const email = session?.user.email || 'حساب المالك';
  const initials = email.slice(0, 1).toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>الإعدادات والخصوصية</Text>
          <Text style={styles.title}>حساب المالك</Text>
          <Text style={styles.subtitle}>إدارة جلستك ومراجعة طريقة حماية بيانات المركز.</Text>
        </View>

        <SurfaceCard style={styles.profileCard}>
          <View style={styles.profileTop}>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>مالك المركز</Text>
              <Text numberOfLines={1} style={styles.profileEmail}>{email}</Text>
            </View>
            <View style={styles.profileAvatar}><Text style={styles.profileInitial}>{initials}</Text></View>
          </View>
          <View style={styles.profileDivider} />
          <View style={styles.profileMeta}>
            <View style={styles.metaItem}><Building2 size={15} color={theme.colors.primary} /><Text style={styles.metaText}>{snapshot?.metrics.centerName || 'مركزك التعليمي'}</Text></View>
            <View style={styles.rolePill}><Check size={12} color={theme.colors.success} /><Text style={styles.roleText}>{membership?.role === 'owner' ? (membership.offlineVerified ? 'مالك · وضع دون اتصال' : 'مالك · قراءة فقط') : 'جارٍ التحقق'}</Text></View>
          </View>
        </SurfaceCard>

        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View style={styles.statusIcon}><Wifi size={18} color={theme.colors.primary} /></View>
            <LiveIndicator status={status} />
          </View>
          <Text style={styles.statusTitle}>اتصال المركز</Text>
          <Text style={styles.statusDescription}>تُحدَّث لوحة المتابعة تلقائيًا عند تسجيل نشاط جديد، وتُعاد مزامنة الملخص بعد عودة الاتصال.</Text>
          <View style={styles.statusFooter}>
            <View style={styles.updatedLine}><Clock3 size={13} color={theme.colors.muted} /><Text style={styles.updatedText}>آخر تحديث{snapshot?.source === 'cache' ? ' محفوظ' : ''} {snapshot ? formatSnapshotTime(snapshot.refreshedAt) : '—'}</Text></View>
            <Pressable onPress={() => void refresh()} disabled={refreshing} style={styles.refreshButton}>
              {refreshing ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <RefreshCw size={14} color={theme.colors.primary} />}
              <Text style={styles.refreshText}>تحديث الآن</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionLabel}>حماية البيانات</Text>
        <SurfaceCard style={styles.securityCard}>
          <SecurityRow icon={LockKeyhole} title="صلاحية قراءة فقط" detail="لا يمكن للتطبيق إنشاء أو تعديل أو حذف سجلات المركز." />
          <SecurityRow icon={ShieldCheck} title="عزل على مستوى قاعدة البيانات" detail="سياسات RLS تحدد المركز المرتبط بحسابك من الجلسة الآمنة." />
          <SecurityRow icon={Smartphone} title="جلسة مشفّرة على الجهاز" detail="تُحفظ بيانات الدخول في التخزين الآمن للنظام، ولا تُحفظ مفاتيح إدارية في التطبيق." last />
        </SurfaceCard>

        <View style={styles.infoNote}>
          <CircleHelp size={16} color={theme.colors.blue} />
          <Text style={styles.infoText}>لإضافة حساب مالك أو تغيير صلاحياته، تواصل مع مسؤول Supabase للمركز. لا تُرسل كلمة مرورك لأي موظف.</Text>
        </View>

        <Pressable onPress={confirmSignOut} disabled={signingOut} style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutPressed]}>
          {signingOut ? <ActivityIndicator color={theme.colors.danger} /> : <>
            <LogOut size={17} color={theme.colors.danger} />
            <Text style={styles.signOutText}>تسجيل الخروج من هذا الجهاز</Text>
            <ChevronLeft size={16} color={theme.colors.danger} />
          </>}
        </Pressable>
        <Text style={styles.version}>KZ Center Owner · لوحة متابعة آمنة</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SecurityRow({ icon: Icon, title, detail, last = false }: {
  icon: typeof ShieldCheck;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.securityRow, !last && styles.securityDivider]}>
      <View style={styles.securityIcon}><Icon size={17} color={theme.colors.primary} /></View>
      <View style={styles.securityCopy}>
        <Text style={styles.securityTitle}>{title}</Text>
        <Text style={styles.securityDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 19, paddingTop: 15, paddingBottom: 35 },
  heading: { alignItems: 'flex-end', marginBottom: 17 },
  eyebrow: { color: theme.colors.primary, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  title: { color: theme.colors.ink, fontSize: 24, fontWeight: '900', textAlign: 'right', marginTop: 4 },
  subtitle: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, textAlign: 'right', marginTop: 5 },
  profileCard: { padding: 16 },
  profileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl' },
  profileCopy: { flex: 1, alignItems: 'flex-start' },
  profileName: { color: theme.colors.ink, fontSize: 15, fontWeight: '900' },
  profileEmail: { color: theme.colors.muted, fontSize: 11, marginTop: 4, maxWidth: '100%', writingDirection: 'ltr' },
  profileAvatar: { width: 48, height: 48, borderRadius: 17, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { color: theme.colors.primaryDark, fontSize: 20, fontWeight: '900' },
  profileDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, marginVertical: 14 },
  profileMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', gap: 8 },
  metaItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: theme.colors.ink, fontSize: 10, fontWeight: '700', flexShrink: 1 },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.successSoft, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 6 },
  roleText: { color: theme.colors.success, fontSize: 9, fontWeight: '800' },
  statusCard: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.card, padding: 16, marginTop: 13, ...theme.shadow.card },
  statusTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl' },
  statusIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { color: theme.colors.ink, fontSize: 14, fontWeight: '900', textAlign: 'right', marginTop: 12 },
  statusDescription: { color: theme.colors.muted, fontSize: 10, lineHeight: 17, textAlign: 'right', marginTop: 5 },
  statusFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, paddingTop: 11 },
  updatedLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  updatedText: { color: theme.colors.muted, fontSize: 9, fontWeight: '600' },
  refreshButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.primarySoft, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 10 },
  refreshText: { color: theme.colors.primaryDark, fontSize: 10, fontWeight: '800' },
  sectionLabel: { color: theme.colors.ink, fontSize: 14, fontWeight: '900', textAlign: 'right', marginTop: 22, marginBottom: 10 },
  securityCard: { paddingHorizontal: 14, paddingVertical: 3 },
  securityRow: { flexDirection: 'row', direction: 'rtl', gap: 11, paddingVertical: 14, alignItems: 'flex-start' },
  securityDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  securityIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  securityCopy: { flex: 1, alignItems: 'flex-start' },
  securityTitle: { color: theme.colors.ink, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  securityDetail: { color: theme.colors.muted, fontSize: 10, lineHeight: 16, marginTop: 4, textAlign: 'right' },
  infoNote: { flexDirection: 'row', alignItems: 'flex-start', direction: 'rtl', gap: 9, backgroundColor: theme.colors.blueSoft, borderRadius: 16, padding: 13, marginTop: 13 },
  infoText: { flex: 1, color: theme.colors.ink, fontSize: 10, lineHeight: 17, textAlign: 'right' },
  signOutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', minHeight: 50, backgroundColor: theme.colors.dangerSoft, borderRadius: 15, paddingHorizontal: 14, marginTop: 22 },
  signOutPressed: { opacity: 0.75 },
  signOutText: { flex: 1, color: theme.colors.danger, fontSize: 12, fontWeight: '800', textAlign: 'right', marginHorizontal: 10 },
  version: { color: theme.colors.muted, fontSize: 9, textAlign: 'center', marginTop: 17 },
});
