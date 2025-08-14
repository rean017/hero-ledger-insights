import { fmtMonthLabel, useAvailableMonths } from '../hooks/useAvailableMonths';

type Props = {
  value: string | '';
  onChange: (m: string) => void;
  className?: string;
  id?: string;
};

export default function MonthPicker({ value, onChange, className, id }: Props) {
  const { data: months = [], isLoading: loading, error } = useAvailableMonths();

  // Auto-select newest if empty
  if (!value && !loading && months.length > 0) {
    queueMicrotask(() => onChange(months[0]));
  }

  return (
    <select
      id={id}
      className={className ?? 'border rounded px-3 py-2 bg-background'}
      value={value}
      onChange={(e) => { 
        console.info('🗓️ [month] change:', e.target.value); 
        onChange(e.target.value); 
      }}
      disabled={loading || months.length === 0}
      title={error?.message ?? undefined}
    >
      {loading && <option>Loading months…</option>}
      {!loading && months.length === 0 && <option>No months (upload data first)</option>}
      {!loading && months.map(m => (
        <option key={m} value={m}>{fmtMonthLabel(m)}</option>
      ))}
    </select>
  );
}