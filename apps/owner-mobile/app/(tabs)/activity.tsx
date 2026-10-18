import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Activity, CalendarDays, CircleDollarSign, UsersRound } from 'lucide-react-native';
import { ActivityRow, LiveIndicator, SurfaceCard } from '../../src/components/Shared';
import { useOwnerLiveData } from '../../src/contexts/OwnerLiveContext';
import { formatDayLabel } from '../../src/lib/format';
import type { ActivityItem } from '../../src/lib/owner-data';
import { theme } from '../../src/theme';

type ActivityFilter = 'all' | 'money' | 'people' | 'system';

export default function ActivityScreen() {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const { snapshot, error, status, refreshing, refresh } = useOwnerLiveData();
  const allItems = snapshot?.activity || [];
  const filteredItems = useMemo(() => allItems.filter(item => matchesFilter(item, filter)), [allItems, filter]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
      >
        <View style={styles.topline}>
          <View style={styles.titleBlock}>
            <Text style={styles.eyebrow}>متابعة فريقك</Text>
            <Text style={styles.title}>سجل النشاط</Text>
            <View style={styles.dateLine}><CalendarDays size={13} color={theme.colors.muted} /><Text style={styles.dateText}>{formatDayLabel()}</Text></View>
          </View>
          <LiveIndicator status={status} />
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}><Activity size={18} color={theme.colors.white} /></View>
          <View style={styles.summaryText}>
            <Text style={styles.summaryTitle}>سجل موحّد للمركز</Text>
            <Text style={styles.summarySub}>أحدث {allItems.length} عملية مسجلة من أعضاء الفريق</Text>
          </View>
          <Text style={styles.summaryCount}>{allItems.length.toLocaleString('ar-EG')}</Text>
        </View>

        {error && !snapshot ? (
          <Pressable onPress={() => void refresh()} style={styles.errorCard}>
            <Text style={styles.errorTitle}>تعذّر تحميل سجل النشاط</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorAction}>إعادة المحاولة ←</Text>
          </Pressable>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <FilterChip label="الكل" count={allItems.length} active={filter === 'all'} onPress={() => setFilter('all')} Icon={Activity} />
          <FilterChip label="مالي" active={filter === 'money'} onPress={() => setFilter('money')} Icon={CircleDollarSign} />
          <FilterChip label="الفريق والطلاب" active={filter === 'people'} onPress={() => setFilter('people')} Icon={UsersRound} />
          <FilterChip label="أخرى" active={filter === 'system'} onPress={() => setFilter('system')} Icon={CalendarDays} />
        </ScrollView>

        <SurfaceCard style={styles.listCard}>
          {filteredItems.length ? filteredItems.map((item, index) => (
            <ActivityRow key={item.id} item={item} last={index === filteredItems.length - 1} />
          )) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Activity size={21} color={theme.colors.muted} /></View>
              <Text style={styles.emptyTitle}>{snapshot ? 'لا توجد نتائج لهذا التصنيف' : 'جارٍ تحميل سجل النشاط'}</Text>
              <Text style={styles.emptyCopy}>تظهر هنا التغييرات التي يسجلها فريق المركز، مع اسم المستخدم ووقت العملية.</Text>
            </View>
          )}
        </SurfaceCard>
        <Text style={styles.securityNote}>سجل للمتابعة فقط · لا يمكن تعديل سجلات الفريق من تطبيق المالك</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterChip({ label, count, active, onPress, Icon }: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
  Icon: typeof Activity;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}>
      <Icon size={14} color={active ? theme.colors.white : theme.colors.muted} />
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
      {typeof count === 'number' ? <Text style={[styles.filterCount, active && styles.filterCountActive]}>{count.toLocaleString('ar-EG')}</Text> : null}
    </Pressable>
  );
}

function matchesFilter(item: ActivityItem, filter: ActivityFilter): boolean {
  if (filter === 'all') return true;
  const text = `${item.action} ${item.entity}`.toLowerCase();
  if (filter === 'money') return /payment|refund|expense|payroll|money|payment|تحصيل|استرداد|مصروف|راتب/.test(text);
  if (filter === 'people') return /student|teacher|attendance|group|enrollment|طالب|مدرس|حضور|مجموعة/.test(text);
  return !/payment|refund|expense|payroll|student|teacher|attendance|group|enrollment|تحصيل|استرداد|مصروف|راتب|طالب|مدرس|حضور|مجموعة/.test(text);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 19, paddingTop: 15, paddingBottom: 30 },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl', marginBottom: 19 },
  titleBlock: { alignItems: 'flex-start' },
  eyebrow: { color: theme.colors.primary, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  title: { color: theme.colors.ink, fontSize: 24, fontWeight: '900', textAlign: 'right', marginTop: 3 },
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  dateText: { color: theme.colors.muted, fontSize: 10, fontWeight: '600' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 11, direction: 'rtl', backgroundColor: theme.colors.primaryDark, borderRadius: 21, padding: 16, overflow: 'hidden' },
  summaryIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  summaryText: { flex: 1, alignItems: 'flex-start' },
  summaryTitle: { color: theme.colors.white, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  summarySub: { color: 'rgba(255,255,255,0.68)', fontSize: 10, marginTop: 4, textAlign: 'right' },
  summaryCount: { color: theme.colors.white, fontSize: 18, fontWeight: '900' },
  errorCard: { backgroundColor: theme.colors.dangerSoft, borderRadius: 16, padding: 14, marginTop: 13 },
  errorTitle: { color: theme.colors.danger, textAlign: 'right', fontSize: 12, fontWeight: '800' },
  errorText: { color: theme.colors.ink, textAlign: 'right', fontSize: 10, lineHeight: 17, marginTop: 5 },
  errorAction: { color: theme.colors.danger, textAlign: 'right', fontSize: 10, fontWeight: '800', marginTop: 8 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 17, paddingBottom: 14, direction: 'rtl' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 99, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterText: { color: theme.colors.muted, fontSize: 10, fontWeight: '700' },
  filterTextActive: { color: theme.colors.white },
  filterCount: { color: theme.colors.muted, fontSize: 9, fontWeight: '700', backgroundColor: theme.colors.background, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 99 },
  filterCountActive: { color: theme.colors.primaryDark, backgroundColor: '#D8F0E4' },
  listCard: { paddingHorizontal: 13, paddingVertical: 2 },
  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 18 },
  emptyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: theme.colors.surfaceTint, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: theme.colors.ink, fontSize: 12, fontWeight: '800', textAlign: 'center', marginTop: 11 },
  emptyCopy: { color: theme.colors.muted, fontSize: 10, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  securityNote: { color: theme.colors.muted, fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 18 },
});
