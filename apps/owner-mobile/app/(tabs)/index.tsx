import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowDownLeft, ArrowUpLeft, Banknote, CalendarDays, ChevronLeft, CircleDollarSign, UserRoundPlus, UsersRound, WalletCards } from 'lucide-react-native';
import { ActivityRow, LiveIndicator, SectionTitle, SurfaceCard } from '../../src/components/Shared';
import { useOwnerLiveData } from '../../src/contexts/OwnerLiveContext';
import { formatCurrency, formatDayLabel, formatSnapshotTime } from '../../src/lib/format';
import { theme } from '../../src/theme';

export default function DashboardScreen() {
  const router = useRouter();
  const { snapshot, error, status, refreshing, refresh } = useOwnerLiveData();
  const metrics = snapshot?.metrics;
  const todayLabel = formatDayLabel();
  const methods = Object.entries(metrics?.byMethod || {}).sort((a, b) => b[1] - a[1]);
  const collectors = metrics?.byCollector || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>مساحة المالك</Text>
            <Text numberOfLines={1} style={styles.centerName}>{metrics?.centerName || 'مركزك التعليمي'}</Text>
            <View style={styles.dateLine}><CalendarDays size={13} color={theme.colors.muted} /><Text style={styles.dateText}>{todayLabel}</Text></View>
          </View>
          <View style={styles.headerRight}>
            <LiveIndicator status={status} />
            <View style={styles.avatar}><Text style={styles.avatarText}>KZ</Text></View>
          </View>
        </View>

        {error ? (
          <Pressable style={styles.errorBanner} onPress={() => void refresh()}>
            <Text style={styles.errorTitle}>{snapshot ? 'تعذّر التحديث · تعرض آخر نسخة محفوظة' : 'البيانات غير متاحة الآن'}</Text>
            <Text style={styles.errorCopy}>{error}</Text>
            <Text style={styles.errorAction}>اضغط لإعادة المحاولة ←</Text>
          </Pressable>
        ) : snapshot?.source === 'cache' ? (
          <View style={styles.cacheBanner}>
            <Text style={styles.cacheText}>تعرض نسخة آمنة محفوظة · جارٍ التحقق من الاتصال</Text>
          </View>
        ) : null}

        <View style={styles.heroCard}>
          <View style={styles.heroOrb} />
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}><CircleDollarSign size={19} color={theme.colors.white} /></View>
            <Text style={styles.heroCaption}>إجمالي التحصيل اليوم</Text>
          </View>
          <Text style={styles.heroAmount}>{formatCurrency(metrics?.collected ?? 0, metrics?.currency)}</Text>
          <View style={styles.heroFooter}>
            <View style={styles.heroFootText}><Text style={styles.heroFootLabel}>دفعة محصّلة</Text><Text style={styles.heroFootValue}>{metrics?.paymentCount ?? '—'}</Text></View>
            <View style={styles.heroFootDivider} />
            <View style={styles.heroFootText}><Text style={styles.heroFootLabel}>آخر تحديث</Text><Text style={styles.heroFootValue}>{snapshot ? `${snapshot.source === 'cache' ? 'محفوظ · ' : ''}${formatSnapshotTime(snapshot.refreshedAt)}` : 'بانتظار الاتصال'}</Text></View>
            <View style={styles.heroArrow}><ArrowDownLeft size={16} color={theme.colors.primaryDark} /></View>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionCaption}>ملخص اليوم</Text>
          <View style={styles.todayPill}><View style={styles.todayDot} /><Text style={styles.todayText}>اليوم</Text></View>
        </View>
        <View style={styles.metricRow}>
          <MetricTile label="صافي الحركة" value={formatCurrency(metrics?.net ?? 0, metrics?.currency)} icon={WalletCards} tone="green" hint="بعد المصروفات والاسترداد" />
          <MetricTile label="المصروفات" value={formatCurrency(metrics?.expenses ?? 0, metrics?.currency)} icon={ArrowUpLeft} tone="amber" hint="مسجلة اليوم" />
          <MetricTile label="الاستردادات" value={formatCurrency(metrics?.refunds ?? 0, metrics?.currency)} icon={ArrowDownLeft} tone="rose" hint="مسجلة اليوم" />
        </View>

        <View style={styles.peopleRow}>
          <SurfaceCard style={styles.peopleCard}>
            <View style={[styles.peopleIcon, { backgroundColor: theme.colors.blueSoft }]}><UserRoundPlus size={18} color={theme.colors.blue} /></View>
            <View style={styles.peopleCopy}>
              <Text style={styles.peopleValue}>{metrics?.newStudents ?? '—'}</Text>
              <Text style={styles.peopleLabel}>طلاب جدد اليوم</Text>
            </View>
          </SurfaceCard>
          <SurfaceCard style={styles.peopleCard}>
            <View style={[styles.peopleIcon, { backgroundColor: theme.colors.primarySoft }]}><UsersRound size={18} color={theme.colors.primary} /></View>
            <View style={styles.peopleCopy}>
              <Text style={styles.peopleValue}>{metrics?.attendanceCount ?? '—'}</Text>
              <Text style={styles.peopleLabel}>حركات الحضور</Text>
              {metrics ? <Text style={styles.peopleHint}>{metrics.absentCount} غياب مسجل</Text> : null}
            </View>
          </SurfaceCard>
        </View>

        {collectors.length > 0 ? (
          <View style={styles.methodsSection}>
            <SectionTitle title="التحصيل حسب الموظف" />
            <SurfaceCard style={styles.methodsCard}>
              {collectors.slice(0, 4).map((collector, index) => {
                const total = Math.max(metrics?.collected || 0, 1);
                const width = `${Math.max(4, Math.min(100, collector.amount / total * 100))}%` as `${number}%`;
                return (
                  <View key={collector.id} style={index < Math.min(collectors.length, 4) - 1 ? styles.methodItem : styles.methodItemLast}>
                    <View style={styles.collectorLine}>
                      <View style={styles.collectorDetails}>
                        <View style={styles.collectorAvatar}><Text style={styles.collectorInitial}>{collector.name.trim().slice(0, 1) || '؟'}</Text></View>
                        <View style={styles.collectorCopy}>
                          <Text numberOfLines={1} style={styles.collectorName}>{collector.name}</Text>
                          <Text style={styles.collectorCount}>{collector.paymentCount} دفعة</Text>
                        </View>
                      </View>
                      <Text style={styles.methodAmount}>{formatCurrency(collector.amount, metrics?.currency)}</Text>
                    </View>
                    <View style={styles.methodTrack}><View style={[styles.methodFill, { width }]} /></View>
                  </View>
                );
              })}
            </SurfaceCard>
          </View>
        ) : null}

        {methods.length > 0 ? (
          <View style={styles.methodsSection}>
            <SectionTitle title="طرق التحصيل" />
            <SurfaceCard style={styles.methodsCard}>
              {methods.slice(0, 4).map(([method, amount], index) => {
                const total = Math.max(metrics?.collected || 0, 1);
                const width = `${Math.max(4, Math.min(100, amount / total * 100))}%` as `${number}%`;
                return (
                  <View key={method} style={index < Math.min(methods.length, 4) - 1 ? styles.methodItem : styles.methodItemLast}>
                    <View style={styles.methodTop}>
                      <Text style={styles.methodAmount}>{formatCurrency(amount, metrics?.currency)}</Text>
                      <Text style={styles.methodName}>{methodLabel(method)}</Text>
                    </View>
                    <View style={styles.methodTrack}><View style={[styles.methodFill, { width }]} /></View>
                  </View>
                );
              })}
            </SurfaceCard>
          </View>
        ) : null}

        <View style={styles.activitySection}>
          <SectionTitle title="آخر النشاطات" action="عرض الكل" onAction={() => router.push('/(tabs)/activity')} />
          <SurfaceCard style={styles.activityCard}>
            {snapshot?.activity.length ? snapshot.activity.slice(0, 4).map((item, index, items) => (
              <ActivityRow key={item.id} item={item} last={index === items.length - 1} />
            )) : (
              <View style={styles.emptyActivity}>
                <View style={styles.emptyIcon}><Banknote size={20} color={theme.colors.muted} /></View>
                <Text style={styles.emptyTitle}>{snapshot ? 'لا توجد نشاطات مسجلة بعد' : 'بانتظار تحميل النشاطات'}</Text>
                <Text style={styles.emptySub}>ستظهر هنا آخر التغييرات والتحصيلات التي يسجلها فريقك.</Text>
                {!snapshot && refreshing ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 12 }} /> : null}
              </View>
            )}
          </SurfaceCard>
        </View>

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>بياناتك محمية ومقروءة فقط من حساب المالك</Text>
          <ChevronLeft size={14} color={theme.colors.muted} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricTile({ label, value, icon: Icon, tone, hint }: {
  label: string;
  value: string;
  icon: typeof WalletCards;
  tone: 'green' | 'amber' | 'rose';
  hint: string;
}) {
  const color = tone === 'green' ? theme.colors.primary : tone === 'amber' ? theme.colors.warning : theme.colors.danger;
  const background = tone === 'green' ? theme.colors.primarySoft : tone === 'amber' ? theme.colors.warningSoft : theme.colors.dangerSoft;
  return (
    <SurfaceCard style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: background }]}><Icon size={16} color={color} strokeWidth={2.2} /></View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricHint}>{hint}</Text>
    </SurfaceCard>
  );
}

function methodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: 'نقدي',
    vodafone_cash: 'فودافون كاش',
    instapay: 'إنستا باي',
    card: 'بطاقة بنكية',
    bank: 'تحويل بنكي',
    bank_transfer: 'تحويل بنكي',
    wallet: 'محفظة إلكترونية',
    cheque: 'شيك',
    other: 'أخرى',
  };
  return labels[method.toLowerCase()] || method;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 19, paddingTop: 12, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', marginBottom: 20 },
  headerCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  eyebrow: { color: theme.colors.primary, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  centerName: { color: theme.colors.ink, fontSize: 19, fontWeight: '900', marginTop: 3, textAlign: 'right', maxWidth: '100%' },
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  dateText: { color: theme.colors.muted, fontSize: 10, fontWeight: '600' },
  headerRight: { alignItems: 'flex-end', gap: 8 },
  avatar: { width: 38, height: 38, borderRadius: 14, backgroundColor: theme.colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.colors.white, fontWeight: '900', fontSize: 12 },
  heroCard: { borderRadius: 26, backgroundColor: theme.colors.primaryDark, paddingHorizontal: 20, paddingTop: 19, paddingBottom: 14, overflow: 'hidden', position: 'relative', ...theme.shadow.card },
  heroOrb: { position: 'absolute', width: 205, height: 205, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.055)', top: -92, left: -48 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10, direction: 'rtl' },
  heroIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  heroCaption: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  heroAmount: { color: theme.colors.white, fontSize: 30, fontWeight: '900', textAlign: 'right', marginTop: 13, writingDirection: 'rtl' },
  heroFooter: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl' },
  heroFootText: { alignItems: 'flex-start', gap: 3 },
  heroFootLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 9, fontWeight: '600' },
  heroFootValue: { color: theme.colors.white, fontSize: 12, fontWeight: '800' },
  heroFootDivider: { width: 1, height: 25, backgroundColor: 'rgba(255,255,255,0.2)' },
  heroArrow: { width: 31, height: 31, borderRadius: 11, backgroundColor: '#E1F4E9', alignItems: 'center', justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', marginTop: 23, marginBottom: 11 },
  sectionCaption: { color: theme.colors.ink, fontSize: 15, fontWeight: '900' },
  todayPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, paddingVertical: 6 },
  todayDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: theme.colors.primary },
  todayText: { color: theme.colors.muted, fontSize: 10, fontWeight: '700' },
  metricRow: { flexDirection: 'row', gap: 8, direction: 'rtl' },
  metricCard: { flex: 1, minWidth: 0, minHeight: 131, paddingHorizontal: 10, paddingVertical: 12, alignItems: 'flex-end' },
  metricIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  metricValue: { color: theme.colors.ink, fontSize: 15, fontWeight: '900', maxWidth: '100%', textAlign: 'right', writingDirection: 'rtl' },
  metricLabel: { color: theme.colors.ink, fontSize: 10, fontWeight: '800', marginTop: 5, textAlign: 'right' },
  metricHint: { color: theme.colors.muted, fontSize: 8, fontWeight: '500', marginTop: 4, textAlign: 'right' },
  peopleRow: { flexDirection: 'row', gap: 9, marginTop: 10, direction: 'rtl' },
  peopleCard: { flex: 1, flexDirection: 'row', gap: 10, padding: 13, alignItems: 'center', minHeight: 75 },
  peopleIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  peopleCopy: { flex: 1, alignItems: 'flex-start' },
  peopleValue: { color: theme.colors.ink, fontSize: 19, fontWeight: '900' },
  peopleLabel: { color: theme.colors.muted, fontSize: 10, fontWeight: '700', marginTop: 1, textAlign: 'right' },
  peopleHint: { color: theme.colors.warning, fontSize: 9, fontWeight: '600', marginTop: 3, textAlign: 'right' },
  methodsSection: { marginTop: 23 },
  methodsCard: { paddingHorizontal: 15, paddingVertical: 3 },
  methodItem: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  methodItemLast: { paddingVertical: 12 },
  methodTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', marginBottom: 8 },
  methodName: { color: theme.colors.ink, fontSize: 11, fontWeight: '700' },
  methodAmount: { color: theme.colors.muted, fontSize: 11, fontWeight: '700' },
  collectorLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', gap: 10, marginBottom: 9 },
  collectorDetails: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, direction: 'rtl' },
  collectorAvatar: { width: 31, height: 31, borderRadius: 11, backgroundColor: theme.colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  collectorInitial: { color: theme.colors.blue, fontSize: 12, fontWeight: '900' },
  collectorCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  collectorName: { color: theme.colors.ink, fontSize: 11, fontWeight: '800', textAlign: 'right', maxWidth: '100%' },
  collectorCount: { color: theme.colors.muted, fontSize: 9, fontWeight: '600', marginTop: 2 },
  methodTrack: { height: 5, borderRadius: 99, backgroundColor: '#EEF3F0', overflow: 'hidden', alignItems: 'flex-end' },
  methodFill: { height: '100%', borderRadius: 99, backgroundColor: theme.colors.primary },
  activitySection: { marginTop: 22 },
  activityCard: { paddingHorizontal: 13, paddingVertical: 0 },
  emptyActivity: { alignItems: 'center', paddingVertical: 23, paddingHorizontal: 16 },
  emptyIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: theme.colors.surfaceTint, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: theme.colors.ink, fontSize: 12, fontWeight: '800', marginTop: 10 },
  emptySub: { color: theme.colors.muted, fontSize: 10, lineHeight: 17, textAlign: 'center', marginTop: 5 },
  errorBanner: { backgroundColor: theme.colors.dangerSoft, borderRadius: 17, padding: 14, marginBottom: 14 },
  errorTitle: { color: theme.colors.danger, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  errorCopy: { color: theme.colors.ink, fontSize: 10, lineHeight: 17, textAlign: 'right', marginTop: 4 },
  errorAction: { color: theme.colors.danger, fontSize: 10, fontWeight: '800', textAlign: 'right', marginTop: 8 },
  cacheBanner: { backgroundColor: theme.colors.warningSoft, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, marginTop: -6, marginBottom: 14 },
  cacheText: { color: theme.colors.warning, fontSize: 10, fontWeight: '700', textAlign: 'right' },
  footerNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 20 },
  footerText: { color: theme.colors.muted, fontSize: 9, fontWeight: '600' },
});
