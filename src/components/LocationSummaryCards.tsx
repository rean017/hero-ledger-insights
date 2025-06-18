
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Users, DollarSign, MapPin } from "lucide-react";

interface LocationWithExtras {
  id: string;
  name: string;
  account_id?: string;
  account_type?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  is_franchise?: boolean;
  assignedAgents: number;
  totalVolume: number;
  totalCommission: number;
  agentNames: string;
  assignments: any[];
  commissions: any[];
}

interface LocationSummaryCardsProps {
  locations: LocationWithExtras[] | undefined;
}

const LocationSummaryCards = ({ locations }: LocationSummaryCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Total Locations
            </span>
            <span className="font-semibold">{locations?.length || 0}</span>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Assigned Locations
            </span>
            <span className="font-semibold">
              {locations?.filter(l => l.assignedAgents > 0).length || 0}
            </span>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total Volume
            </span>
            <span className="font-semibold">
              ${(locations?.reduce((sum, l) => sum + (l.totalVolume || 0), 0) || 0).toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Total Commission
            </span>
            <span className="font-semibold">
              ${(locations?.reduce((sum, l) => sum + (l.totalCommission || 0), 0) || 0).toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationSummaryCards;
