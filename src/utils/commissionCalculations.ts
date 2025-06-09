
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
  console.log('=== Commission Calculation Debug ===');
  console.log('Total transactions:', transactions.length);
  console.log('Total assignments:', assignments.length);
  console.log('Total locations:', locations.length);
  
  const commissions: LocationCommission[] = [];

  // Group transactions by location (account_id) and calculate total volume per location
  const locationVolumes = transactions.reduce((acc, transaction) => {
    const accountId = transaction.account_id;
    if (!accountId) return acc;
    
    if (!acc[accountId]) {
      acc[accountId] = 0;
    }
    
    // Add both regular volume and debit volume
    const volume = parseFloat(transaction.volume) || 0;
    const debitVolume = parseFloat(transaction.debit_volume) || 0;
    acc[accountId] += volume + debitVolume;
    
    return acc;
  }, {} as Record<string, number>);

  console.log('Location volumes calculated:', locationVolumes);

  // Calculate commissions for each active assignment
  assignments.forEach(assignment => {
    if (!assignment.is_active) {
      console.log('Skipping inactive assignment:', assignment);
      return;
    }

    // Find the location for this assignment
    const location = locations.find(loc => loc.id === assignment.location_id);
    if (!location) {
      console.log('Location not found for assignment:', assignment.location_id);
      return;
    }

    console.log(`Processing assignment: ${assignment.agent_name} at ${location.name}`);

    // Get the total volume for this location using account_id
    const locationVolume = locationVolumes[location.account_id] || 0;
    
    console.log(`Location ${location.name} (${location.account_id}) volume: ${locationVolume}`);

    if (locationVolume > 0) {
      // Calculate commission for this agent at this location
      const decimalRate = convertToDecimalRate(assignment.commission_rate);
      const commission = locationVolume * decimalRate;

      console.log(`Commission calculation:`, {
        agentName: assignment.agent_name,
        locationName: location.name,
        locationVolume,
        storedRate: assignment.commission_rate,
        decimalRate,
        commission
      });

      commissions.push({
        locationId: assignment.location_id,
        locationName: location.name,
        agentName: assignment.agent_name,
        bpsRate: Math.round(assignment.commission_rate * 100), // Convert to BPS for display
        decimalRate,
        locationVolume,
        commission
      });
    } else {
      console.log(`No volume found for location ${location.name} (${location.account_id})`);
    }
  });

  console.log('Final commissions calculated:', commissions);
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
