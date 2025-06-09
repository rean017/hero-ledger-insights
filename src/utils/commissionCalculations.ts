
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
  
  // Debug: Log some sample data
  if (transactions.length > 0) {
    console.log('Sample transaction account_ids:', transactions.slice(0, 5).map(t => t.account_id));
  }
  if (locations.length > 0) {
    console.log('Sample location account_ids:', locations.slice(0, 5).map(l => ({ name: l.name, account_id: l.account_id })));
  }
  
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

  console.log('Transactions grouped by account_id:', Object.keys(transactionsByLocation).map(key => ({
    account_id: key,
    count: transactionsByLocation[key].length
  })));

  // Calculate commissions for each active assignment
  assignments.forEach(assignment => {
    if (!assignment.is_active) return;

    // Find the location
    const location = locations.find(loc => loc.id === assignment.location_id);
    if (!location) {
      console.log('Location not found for assignment:', assignment.location_id);
      return;
    }

    console.log(`Processing location: ${location.name} (account_id: ${location.account_id})`);

    // Get transactions for this location (using account_id)
    const locationTransactions = transactionsByLocation[location.account_id] || [];
    console.log(`Found ${locationTransactions.length} transactions for ${location.name}`);
    
    // Calculate total volume for this location
    const locationVolume = locationTransactions.reduce((sum, tx) => {
      const volume = parseFloat(tx.volume) || 0;
      const debitVolume = parseFloat(tx.debit_volume) || 0;
      return sum + volume + debitVolume;
    }, 0);

    console.log(`Total volume for ${location.name}: ${locationVolume}`);

    // Calculate commission for this agent at this location
    const decimalRate = convertToDecimalRate(assignment.commission_rate);
    const commission = locationVolume * decimalRate;

    console.log(`Commission calculation for ${assignment.agent_name} at ${location.name}:`, {
      locationVolume,
      storedRate: assignment.commission_rate,
      decimalRate,
      commission
    });

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

  console.log('Final commissions calculated:', commissions.length);
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
