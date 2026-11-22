import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoticeCard } from '../src/components/Shared';
import { useAuth } from '../src/contexts/AuthContext';
import { theme } from '../src/theme';

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, configurationMissing } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('أدخل البريد الإلكتروني وكلمة المرور للمتابعة.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(email, password);
      if (result) setError(result);
      else router.replace('/');
    } catch {
      setError('تعذّر تسجيل الدخول الآن. تحقق من الإنترنت وحاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.topMeta}>
            <Text style={styles.topLabel}>EDUCENTER PRO</Text>
            <View style={styles.topBadge}><ShieldCheck size={14} color={theme.colors.primary} /><Text style={styles.topBadgeText}>دخول آمن</Text></View>
          </View>

          <View style={styles.intro}>
            <View style={styles.brandTile}><View style={styles.brandGlyph}><Text style={styles.brandGlyphText}>KZ</Text></View></View>
            <Text style={styles.title}>كل تفاصيل مركزك،{`\n`}في مكان واحد.</Text>
            <Text style={styles.subtitle}>لوحة متابعة المالك لمراقبة التحصيل ونشاط الفريق لحظة بلحظة.</Text>
          </View>

          {configurationMissing ? (
            <NoticeCard
              title="التطبيق يحتاج إعداد الاتصال"
              description="أضف عنوان Supabase والمفتاح العام إلى ملف .env قبل تشغيل التطبيق. لا تستخدم مفتاح service_role على الهاتف."
              tone="danger"
            />
          ) : null}

          <View style={styles.form}>
            <Text style={styles.formHeading}>تسجيل الدخول</Text>
            <Text style={styles.fieldLabel}>البريد الإلكتروني</Text>
            <View style={styles.inputWrap}>
              <Mail size={18} color={theme.colors.muted} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
                textContentType="emailAddress"
                placeholder="name@example.com"
                placeholderTextColor="#A8B4AE"
                style={styles.input}
                accessibilityLabel="البريد الإلكتروني"
                returnKeyType="next"
              />
            </View>

            <Text style={[styles.fieldLabel, styles.passwordLabel]}>كلمة المرور</Text>
            <View style={styles.inputWrap}>
              <LockKeyhole size={18} color={theme.colors.muted} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                secureTextEntry={!visiblePassword}
                placeholder="••••••••"
                placeholderTextColor="#A8B4AE"
                style={styles.input}
                accessibilityLabel="كلمة المرور"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />
              <Pressable onPress={() => setVisiblePassword(value => !value)} hitSlop={12} accessibilityLabel={visiblePassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                {visiblePassword ? <EyeOff size={18} color={theme.colors.muted} /> : <Eye size={18} color={theme.colors.muted} />}
              </Pressable>
            </View>

            {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}

            <Pressable
              onPress={() => void submit()}
              disabled={busy || configurationMissing}
              style={({ pressed }) => [styles.submitButton, pressed && styles.submitPressed, (busy || configurationMissing) && styles.submitDisabled]}
            >
              {busy ? <ActivityIndicator color={theme.colors.white} /> : <>
                <ArrowLeft size={18} color={theme.colors.white} />
                <Text style={styles.submitText}>الدخول إلى لوحة المالك</Text>
              </>}
            </Pressable>

            <View style={styles.secureNote}>
              <ShieldCheck size={15} color={theme.colors.success} />
              <Text style={styles.secureNoteText}>الدخول مخصص لحساب المالك المرتبط بمركزك</Text>
            </View>
          </View>
          <Text style={styles.footer}>متابعة واضحة. قرارات أذكى. مركز أقوى.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 24 },
  topMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl' },
  topLabel: { color: theme.colors.primaryDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  topBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.primarySoft, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99 },
  topBadgeText: { color: theme.colors.primaryDark, fontSize: 10, fontWeight: '700' },
  intro: { alignItems: 'flex-end', marginTop: 40, marginBottom: 26 },
  brandTile: { width: 58, height: 58, borderRadius: 20, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 20, alignSelf: 'flex-end' },
  brandGlyph: { width: 42, height: 42, borderRadius: 15, borderColor: 'rgba(255,255,255,0.6)', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  brandGlyphText: { color: theme.colors.white, fontSize: 15, fontWeight: '900', letterSpacing: -0.5 },
  title: { color: theme.colors.ink, fontSize: 31, lineHeight: 43, fontWeight: '900', textAlign: 'right', width: '100%' },
  subtitle: { color: theme.colors.muted, fontSize: 13, lineHeight: 22, textAlign: 'right', width: '100%', marginTop: 10 },
  form: { backgroundColor: theme.colors.surface, borderRadius: 25, borderWidth: 1, borderColor: theme.colors.border, padding: 19, ...theme.shadow.card },
  formHeading: { color: theme.colors.ink, fontSize: 17, fontWeight: '800', textAlign: 'right', marginBottom: 20 },
  fieldLabel: { color: theme.colors.ink, fontSize: 12, fontWeight: '700', textAlign: 'right', marginBottom: 8 },
  passwordLabel: { marginTop: 18 },
  inputWrap: { minHeight: 54, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 15, backgroundColor: theme.colors.surfaceTint, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14 },
  input: { flex: 1, minWidth: 0, paddingVertical: 12, color: theme.colors.ink, fontSize: 14, textAlign: 'right', writingDirection: 'ltr' },
  errorText: { color: theme.colors.danger, textAlign: 'right', fontSize: 12, lineHeight: 19, marginTop: 12 },
  submitButton: { backgroundColor: theme.colors.primary, borderRadius: 15, minHeight: 54, marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  submitPressed: { opacity: 0.85 },
  submitDisabled: { opacity: 0.55 },
  submitText: { color: theme.colors.white, fontSize: 14, fontWeight: '800' },
  secureNote: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 16 },
  secureNoteText: { color: theme.colors.muted, fontSize: 10, fontWeight: '600' },
  footer: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 23 },
});
