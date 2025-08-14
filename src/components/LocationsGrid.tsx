import LocationCard from "@/components/LocationCard";
import { useMemo } from "react";

type LocationRow = {
  id: string;
  name: string;
  volume: number;
  agent_net_payout: number;
  bps: number;
  margin_pct: number;   // 0.0169 for 1.69%
  agents_count: number;
  zero_volume?: boolean;
};

export default function LocationsGrid({
  data,
  onAssign,
  onMore
}: {
  data: LocationRow[];
  onAssign: (locationId: string) => void;
  onMore: (locationId: string) => void;
}) {
  const items = useMemo(() => data ?? [], [data]);

  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No locations for this month.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {items.map((loc) => (
        <LocationCard
          key={loc.id}
          id={loc.id}
          name={loc.name}
          volume={loc.volume}
          agentNetPayout={loc.agent_net_payout}
          bps={loc.bps}
          marginPct={loc.margin_pct}
          agentsCount={loc.agents_count}
          isZeroVolume={!!loc.zero_volume}
          onAssign={onAssign}
          onMore={onMore}
        />
      ))}
    </div>
  );
}