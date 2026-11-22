import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Activity, Banknote, CircleDollarSign, UserRoundPlus, UsersRound } from 'lucide-react-native';
import type { ActivityItem } from '../lib/owner-data';
import { activityTitle, formatActivityTime } from '../lib/format';
import { theme } from '../theme';
import type { LiveStatus } from '../contexts/OwnerLiveContext';

export function LoadingScreen({ label = 'جارٍ تجهيز مساحة المالك' }: { label?: string }) {
  return (
    <View style={styles.loadingScreen}>
      <View style={styles.brandTile}><Activity size={28} color={theme.colors.white} strokeWidth={2.2} /></View>
      <ActivityIndicator color={theme.colors.primary} style={styles.loadingSpinner} />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

export function LiveIndicator({ status }: { status: LiveStatus }) {
  const config: Record<LiveStatus, { label: string; dot: string; bg: string }> = {
    live: { label: 'مباشر', dot: theme.colors.success, bg: theme.colors.successSoft },
    connecting: { label: 'جاري الاتصال', dot: theme.colors.warning, bg: theme.colors.warningSoft },
    reconnecting: { label: 'إعادة الاتصال', dot: theme.colors.warning, bg: theme.colors.warningSoft },
    offline: { label: 'غير متصل', dot: theme.colors.muted, bg: '#EDF1EF' },
    error: { label: 'تعذّر التحديث', dot: theme.colors.danger, bg: theme.colors.dangerSoft },
  };
  const current = config[status];
  return (
    <View style={[styles.liveBadge, { backgroundColor: current.bg }]}>
      <View style={[styles.liveDot, { backgroundColor: current.dot }]} />
      <Text style={[styles.liveText, { color: current.dot }]}>{current.label}</Text>
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeading}>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10}><Text style={styles.sectionAction}>{action}</Text></Pressable>
      ) : <View />}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export function SurfaceCard({ children, style }: PropsWithChildren<{ style?: object }>) {
  return <View style={[styles.surfaceCard, style]}>{children}</View>;
}

export function ActivityRow({ item, last = false }: { item: ActivityItem; last?: boolean }) {
  const lower = `${item.action} ${item.entity}`.toLowerCase();
  const isMoney = /payment|refund|expense|payroll|money|تحصيل|استرداد/.test(lower);
  const isStudent = /student|طالب/.test(lower);
  const Icon = isMoney ? CircleDollarSign : isStudent ? UserRoundPlus : UsersRound;
  const tone = item.action === 'delete' || item.action === 'refund'
    ? { background: theme.colors.warningSoft, foreground: theme.colors.warning }
    : isMoney
      ? { background: theme.colors.primarySoft, foreground: theme.colors.primary }
      : { background: theme.colors.blueSoft, foreground: theme.colors.blue };
  const detail = item.details?.trim() || item.username || 'نشاط على المركز';
  return (
    <View style={[styles.activityRow, !last && styles.activityDivider]}>
      <View style={[styles.activityIcon, { backgroundColor: tone.background }]}><Icon size={18} color={tone.foreground} strokeWidth={2} /></View>
      <View style={styles.activityCopy}>
        <Text numberOfLines={1} style={styles.activityTitle}>{activityTitle(item)}</Text>
        <Text numberOfLines={1} style={styles.activityDetail}>{detail}</Text>
      </View>
      <Text style={styles.activityTime}>{formatActivityTime(item.timestamp)}</Text>
    </View>
  );
}

export function NoticeCard({ title, description, actionLabel, onAction, tone = 'warning' }: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'warning' | 'danger' | 'info';
}) {
  const palette = tone === 'danger'
    ? { background: theme.colors.dangerSoft, foreground: theme.colors.danger }
    : tone === 'info'
      ? { background: theme.colors.blueSoft, foreground: theme.colors.blue }
      : { background: theme.colors.warningSoft, foreground: theme.colors.warning };
  return (
    <View style={[styles.noticeCard, { backgroundColor: palette.background }]}>
      <View style={[styles.noticeIcon, { backgroundColor: theme.colors.white }]}><Banknote size={17} color={palette.foreground} /></View>
      <View style={styles.noticeCopy}>
        <Text style={[styles.noticeTitle, { color: palette.foreground }]}>{title}</Text>
        <Text style={styles.noticeDescription}>{description}</Text>
        {actionLabel && onAction ? <Pressable onPress={onAction}><Text style={[styles.noticeAction, { color: palette.foreground }]}>{actionLabel} ←</Text></Pressable> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background, padding: 28 },
  brandTile: { width: 66, height: 66, borderRadius: 22, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  loadingSpinner: { marginTop: 30 },
  loadingLabel: { marginTop: 14, color: theme.colors.muted, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 11, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, marginTop: 5 },
  sectionTitle: { color: theme.colors.ink, fontSize: 17, fontWeight: '800' },
  sectionAction: { color: theme.colors.primary, fontSize: 12, fontWeight: '700' },
  surfaceCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.card },
  activityRow: { direction: 'rtl', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 11 },
  activityDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  activityIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  activityCopy: { flex: 1, minWidth: 0 },
  activityTitle: { color: theme.colors.ink, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  activityDetail: { color: theme.colors.muted, fontSize: 11, marginTop: 4, textAlign: 'right' },
  activityTime: { color: theme.colors.muted, fontSize: 10, alignSelf: 'flex-start', paddingTop: 3 },
  noticeCard: { flexDirection: 'row', gap: 12, borderRadius: 18, padding: 15, marginTop: 14 },
  noticeIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  noticeCopy: { flex: 1 },
  noticeTitle: { fontSize: 13, fontWeight: '800', textAlign: 'right' },
  noticeDescription: { color: theme.colors.ink, fontSize: 11, lineHeight: 18, marginTop: 5, textAlign: 'right', opacity: 0.75 },
  noticeAction: { fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: 9 },
});
