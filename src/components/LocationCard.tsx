import { ReactNode } from "react";
import { MoreVertical, Users } from "lucide-react";
import { formatMoneyExact, formatBpsExact, formatPercentExact } from '@/lib/numberFormat';

type LocationCardProps = {
  id: string;
  name: string;
  volume: number;               // month volume for this location
  agentNetPayout: number;       // month agent net payout (from facts)
  bps: number;                  // blended/assigned bps shown in table
  marginPct: number;            // 0.0169 => 1.69%
  agentsCount: number;
  isZeroVolume?: boolean;
  onAssign?: (locationId: string) => void;  // open "Assign Agent & BPS" modal
  onMore?: (locationId: string) => void;    // kebab menu / details
  footer?: ReactNode;                        // slot for custom extra
};

const usd = (n: number) => formatMoneyExact(n || 0);
const pct = (n: number) => formatPercentExact(n || 0);
const bpsFmt = (n: number) => formatBpsExact(n || 0);

export default function LocationCard({
  id,
  name,
  volume,
  agentNetPayout,
  bps,
  marginPct,
  agentsCount,
  isZeroVolume,
  onAssign,
  onMore,
  footer
}: LocationCardProps) {
  return (
    <div
      className="group card-base card-hover focus-brand relative p-4"
      tabIndex={0}
      role="article"
      aria-label={`Location ${name}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-6 text-zinc-900">{name}</h3>
          {isZeroVolume && (
            <span className="mt-1 inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
              Zero volume
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onAssign?.(id)}
            className="invisible group-hover:visible rounded-md border border-brand-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 hover:border-brand-400 focus-brand transition-all duration-150 transform hover:scale-105"
            aria-label="Assign agents"
            title="Assign agents"
          >
            <Users className="h-3 w-3 mr-1 inline" />
            Assign
          </button>
          <button
            onClick={() => onMore?.(id)}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-brand-50 hover:text-brand-600 focus-brand transition-all duration-150"
            aria-label="More actions"
            title="More actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Volume" value={usd(volume)} />
        <Metric label="Agent Net Payout" value={usd(agentNetPayout)} />
        <Metric label="BPS" value={bpsFmt(bps)} />
        <Metric label="Margin %" value={pct(marginPct)} />
        <Metric label="# Agents" value={agentsCount.toString()} />
      </div>

      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 px-3 py-2 transition-colors duration-150 hover:border-brand-200">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}