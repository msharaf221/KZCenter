import { getStatusColor, getStatusLabel } from '../../lib/utils';

interface BadgeProps {
  status: string;
  label?: string;
}

export default function Badge({ status, label }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
      {label || getStatusLabel(status)}
    </span>
  );
}
