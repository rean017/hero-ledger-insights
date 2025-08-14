import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoreVertical, Users } from "lucide-react";

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

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

const pct = (n: number) =>
  `${((n || 0) * 100).toFixed(2)}%`;

const bpsFmt = (n: number) => `${Math.round(n || 0)} BPS`;

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
    <Card className="group relative transition-all hover:shadow-md">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-6 text-foreground">{name}</h3>
            {isZeroVolume && (
              <span className="mt-1 inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/20">
                Zero volume
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAssign?.(id)}
              className="hidden group-hover:inline-flex"
            >
              <Users className="h-3 w-3 mr-1" />
              Assign
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onMore?.(id)}
              className="h-8 w-8"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
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
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}