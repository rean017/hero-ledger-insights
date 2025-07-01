
import React from "react";

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

interface AgentAssignmentDisplayProps {
  location: LocationWithExtras;
}

const AgentAssignmentDisplay = ({ location }: AgentAssignmentDisplayProps) => {
  const { assignments = [], commissions = [], totalCommission = 0, totalVolume = 0 } = location;
  
  // Sort assignments to show Merchant Hero last
  const sortedAssignments = [...assignments].sort((a, b) => {
    if (a.agent_name === 'Merchant Hero') return 1;
    if (b.agent_name === 'Merchant Hero') return -1;
    return a.agent_name.localeCompare(b.agent_name);
  });

  // Show volume info
  const volumeDisplay = totalVolume > 0 
    ? `$${totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "No volume data";

  return (
    <div className="space-y-3">
      {/* Volume Display */}
      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
        <div className="text-sm text-blue-700 mb-1">Location Volume</div>
        <div className="font-semibold text-blue-900">{volumeDisplay}</div>
      </div>

      {/* Agent Commissions */}
      {sortedAssignments.map((assignment) => {
        const commission = commissions.find(c => c.agentName === assignment.agent_name);
        const earnings = assignment.agent_name === 'Merchant Hero' 
          ? commission?.merchantHeroPayout || 0
          : commission?.agentPayout || 0;
        
        // For Merchant Hero, show auto-calculated BPS; for others, show their set rate
        const bpsDisplay = assignment.agent_name === 'Merchant Hero'
          ? `${commission?.bpsRate || 0} BPS (Auto-calc)`
          : `${Math.round(assignment.commission_rate * 100)} BPS`;

        return (
          <div key={assignment.id} className="bg-muted/30 rounded-lg p-3">
            <div className="font-medium text-foreground mb-1">
              {assignment.agent_name} – {bpsDisplay}
            </div>
            <div className="text-emerald-600 font-semibold">
              Commission: ${earnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        );
      })}
      
      {assignments.length === 0 && (
        <div className="text-sm text-muted-foreground">No agents assigned</div>
      )}
      
      <div className="pt-3 border-t border-muted">
        <div className="text-sm text-muted-foreground mb-1">Total Commission Payouts:</div>
        <div className="font-semibold text-emerald-600">
          ${totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  );
};

export default AgentAssignmentDisplay;
