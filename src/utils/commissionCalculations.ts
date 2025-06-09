
import { convertToDecimalRate } from './bpsCalculations';

export interface LocationCommission {
  locationId: string;
  locationName: string;
  agentName: string;
  bpsRate: number;
  decimalRate: number;
  locationVolume: number;
  commission: number;
}

export interface AgentLocationSummary {
  agentName: string;
  locations: LocationCommission[];
  totalCommission: number;
}

export const calculateLocationCommissions = (
  transactions: any[],
  assignments: any[],
  locations: any[]
): LocationCommission[] => {
  const commissions: LocationCommission[] = [];

  // Group transactions by location (account_id)
  const transactionsByLocation = transactions.reduce((acc, transaction) => {
    const accountId = transaction.account_id;
    if (!acc[accountId]) {
      acc[accountId] = [];
    }
    acc[accountId].push(transaction);
    return acc;
  }, {} as Record<string, any[]>);

  // Calculate commissions for each active assignment
  assignments.forEach(assignment => {
    if (!assignment.is_active) return;

    // Find the location
    const location = locations.find(loc => loc.id === assignment.location_id);
    if (!location) return;

    // Get transactions for this location (using account_id)
    const locationTransactions = transactionsByLocation[location.account_id] || [];
    
    // Calculate total volume for this location
    const locationVolume = locationTransactions.reduce((sum, tx) => {
      return sum + (parseFloat(tx.volume) || 0);
    }, 0);

    // Calculate commission for this agent at this location
    const decimalRate = convertToDecimalRate(assignment.commission_rate);
    const commission = locationVolume * decimalRate;

    commissions.push({
      locationId: assignment.location_id,
      locationName: location.name,
      agentName: assignment.agent_name,
      bpsRate: Math.round(decimalRate * 100), // Convert back to BPS for display
      decimalRate,
      locationVolume,
      commission
    });
  });

  return commissions;
};

export const groupCommissionsByAgent = (commissions: LocationCommission[]): AgentLocationSummary[] => {
  const grouped = commissions.reduce((acc, commission) => {
    if (!acc[commission.agentName]) {
      acc[commission.agentName] = {
        agentName: commission.agentName,
        locations: [],
        totalCommission: 0
      };
    }
    
    acc[commission.agentName].locations.push(commission);
    acc[commission.agentName].totalCommission += commission.commission;
    
    return acc;
  }, {} as Record<string, AgentLocationSummary>);

  return Object.values(grouped).sort((a, b) => b.totalCommission - a.totalCommission);
};
