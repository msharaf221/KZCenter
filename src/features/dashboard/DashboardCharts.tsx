import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '../../lib/utils';
import type { DashboardData } from '../../services/queries/dashboard';

interface DashboardChartsProps {
  showMoney: boolean;
  revenueData: DashboardData['revenueData'];
  genderData: DashboardData['genderData'];
  primaryColor: string;
  currency?: string;
}

export default function DashboardCharts({
  showMoney,
  revenueData,
  genderData,
  primaryColor,
  currency,
}: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Revenue Chart */}
      {showMoney && (
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-base font-bold text-gray-900 mb-4">الإيرادات الشهرية</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [formatCurrency(Number(v), currency), 'الإيرادات']} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={primaryColor}
                fill="url(#revenue)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gender Pie */}
      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${showMoney ? '' : 'lg:col-span-3'}`}>
        <h3 className="text-base font-bold text-gray-900 mb-4">أولاد و بنات</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={genderData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="value"
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              <Cell fill="#6366f1" />
              <Cell fill="#ec4899" />
            </Pie>
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
