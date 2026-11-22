import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, LogOut, RefreshCw } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/contexts/AuthContext';
import { theme } from '../src/theme';

export default function AccessDeniedScreen() {
  const router = useRouter();
  const { contextError, loading, refreshAccess, signOut } = useAuth();
  const isError = Boolean(contextError);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.iconCircle}><AlertTriangle size={30} color={theme.colors.warning} /></View>
        <Text style={styles.eyebrow}>KZ CENTER · OWNER ACCESS</Text>
        <Text style={styles.title}>{isError ? 'تعذّر التحقق من الصلاحية' : 'هذا الحساب ليس حساب مالك'}</Text>
        <Text style={styles.description}>
          {contextError || 'تطبيق المالك مخصص لحساب مرتبط بمركزك وصلاحية قراءة فقط. اطلب من مسؤول النظام ربط حسابك بالمركز.'}
        </Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>لماذا أُوقف الدخول؟</Text>
          <Text style={styles.infoText}>يُتحقق من عضوية المالك من قاعدة البيانات في كل جلسة. لا يمكن اختيار مركز يدويًا أو تجاوز سياسات الأمان من التطبيق.</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => { refreshAccess(); router.replace('/'); }} disabled={loading}>
          {loading ? <ActivityIndicator color={theme.colors.white} /> : <>
            <RefreshCw size={17} color={theme.colors.white} />
            <Text style={styles.primaryText}>إعادة التحقق</Text>
          </>}
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void signOut().then(() => router.replace('/sign-in'))}>
          <LogOut size={17} color={theme.colors.ink} />
          <Text style={styles.secondaryText}>تسجيل الخروج</Text>
        </Pressable>
        <View style={styles.footer}><ArrowLeft size={14} color={theme.colors.muted} /><Text style={styles.footerText}>تواصل مع مسؤول المركز لتفعيل صلاحيتك</Text></View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 26, alignItems: 'center' },
  iconCircle: { width: 72, height: 72, borderRadius: 25, backgroundColor: theme.colors.warningSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 19 },
  eyebrow: { color: theme.colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: theme.colors.ink, fontSize: 23, lineHeight: 34, fontWeight: '900', textAlign: 'center', marginTop: 13 },
  description: { color: theme.colors.muted, fontSize: 13, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  infoBox: { width: '100%', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 18, padding: 16, marginTop: 25 },
  infoTitle: { color: theme.colors.ink, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  infoText: { color: theme.colors.muted, fontSize: 11, lineHeight: 19, textAlign: 'right', marginTop: 7 },
  primaryButton: { width: '100%', minHeight: 52, borderRadius: 15, backgroundColor: theme.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18 },
  primaryText: { color: theme.colors.white, fontSize: 13, fontWeight: '800' },
  secondaryButton: { width: '100%', minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 10 },
  secondaryText: { color: theme.colors.ink, fontSize: 13, fontWeight: '700' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 26 },
  footerText: { color: theme.colors.muted, fontSize: 10 },
});
