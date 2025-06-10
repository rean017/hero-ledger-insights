
import { convertToDecimalRate } from './bpsCalculations';

export interface LocationCommission {
  locationId: string;
  locationName: string;
  agentName: string;
  bpsRate: number;
  decimalRate: number;
  locationVolume: number;
  netAgentPayout: number;
  agentPayout: number;
  merchantHeroPayout: number;
}

export interface AgentLocationSummary {
  agentName: string;
  locations: LocationCommission[];
  totalCommission: number;
}

interface LocationData {
  totalVolume: number;
  totalAgentPayout: number;
  bankCardTotal: number;
  debitCardTotal: number;
  transactionCount: number;
}

interface Transaction {
  account_id: string;
  volume: number;
  debit_volume: number;
  agent_payout: number;
}

interface Assignment {
  location_id: string;
  agent_name: string;
  commission_rate: number;
  is_active: boolean;
}

interface Location {
  id: string;
  name: string;
  account_id: string;
}

export const calculateLocationCommissions = (
  transactions: Transaction[],
  assignments: Assignment[],
  locations: Location[]
): LocationCommission[] => {
  console.log('=== COMMISSION CALCULATION WITH AUTO MERCHANT HERO ===');
  console.log('Total transactions:', transactions.length);
  console.log('Total assignments:', assignments.length);
  console.log('Total locations:', locations.length);
  
  const commissions: LocationCommission[] = [];

  // Group transactions by location (account_id) and calculate totals
  const locationData = transactions.reduce((acc, transaction) => {
    const accountId = transaction.account_id;
    if (!accountId) {
      console.log('⚠️ Skipping transaction with no account_id:', transaction);
      return acc;
    }
    
    if (!acc[accountId]) {
      acc[accountId] = {
        totalVolume: 0,
        totalAgentPayout: 0,
        bankCardTotal: 0,
        debitCardTotal: 0,
        transactionCount: 0
      };
    }
    
    // Parse volume data (Bank Card + Debit Card for TRNXN)
    const bankCardVolume = Number(transaction.volume) || 0;
    const debitCardVolume = Number(transaction.debit_volume) || 0;
    const totalTransactionVolume = bankCardVolume + debitCardVolume;
    
    acc[accountId].totalVolume += totalTransactionVolume;
    acc[accountId].bankCardTotal += bankCardVolume;
    acc[accountId].debitCardTotal += debitCardVolume;
    acc[accountId].transactionCount += 1;
    
    // agent_payout is the net revenue that Merchant Hero receives
    const agentPayout = Number(transaction.agent_payout) || 0;
    acc[accountId].totalAgentPayout += agentPayout;
    
    console.log(`💰 Location ${accountId} - Volume: ${totalTransactionVolume}, Net Payout: ${agentPayout}`);
    
    return acc;
  }, {} as Record<string, LocationData>);

  console.log('📊 LOCATION DATA SUMMARY:', locationData);

  // Group assignments by location to calculate Merchant Hero automatically
  const assignmentsByLocation = assignments.reduce((acc, assignment) => {
    if (!assignment.is_active) return acc;
    
    if (!acc[assignment.location_id]) {
      acc[assignment.location_id] = [];
    }
    acc[assignment.location_id].push(assignment);
    return acc;
  }, {} as Record<string, Assignment[]>);

  // Calculate commissions for each location
  Object.entries(assignmentsByLocation).forEach(([locationId, locationAssignments]) => {
    const location = locations.find(loc => loc.id === locationId);
    if (!location) {
      console.log('Location not found for assignment:', locationId);
      return;
    }

    const locationInfo = locationData[location.account_id];
    if (!locationInfo) {
      console.log(`No transaction data found for location ${location.name} (${location.account_id})`);
      // Create zero-value entries for display
      locationAssignments.forEach(assignment => {
        commissions.push({
          locationId: assignment.location_id,
          locationName: location.name,
          agentName: assignment.agent_name,
          bpsRate: assignment.agent_name === 'Merchant Hero' ? 0 : Math.round(assignment.commission_rate * 100),
          decimalRate: convertToDecimalRate(assignment.commission_rate),
          locationVolume: 0,
          netAgentPayout: 0,
          agentPayout: 0,
          merchantHeroPayout: 0
        });
      });
      return;
    }

    console.log(`💼 Processing location: ${location.name}`);
    console.log(`📈 Location data:`, {
      totalVolume: locationInfo.totalVolume,
      netAgentPayout: locationInfo.totalAgentPayout
    });

    // First, calculate all non-Merchant Hero agent payouts
    const otherAgents = locationAssignments.filter(a => a.agent_name !== 'Merchant Hero');
    const merchantHeroAssignment = locationAssignments.find(a => a.agent_name === 'Merchant Hero');
    
    let totalCommissionsPaid = 0;
    
    // Calculate payouts for other agents
    otherAgents.forEach(assignment => {
      const bpsDecimal = assignment.commission_rate / 100; // Convert stored decimal to BPS decimal
      const agentPayout = locationInfo.totalVolume * bpsDecimal;
      totalCommissionsPaid += agentPayout;
      
      console.log(`Agent calculation:`, {
        agentName: assignment.agent_name,
        locationName: location.name,
        totalVolume: locationInfo.totalVolume,
        storedRate: assignment.commission_rate,
        bpsDisplay: Math.round(assignment.commission_rate * 100),
        bpsDecimal,
        agentPayout,
        formula: `${locationInfo.totalVolume} × ${bpsDecimal} = ${agentPayout}`
      });

      commissions.push({
        locationId: assignment.location_id,
        locationName: location.name,
        agentName: assignment.agent_name,
        bpsRate: Math.round(assignment.commission_rate * 100),
        decimalRate: bpsDecimal,
        locationVolume: locationInfo.totalVolume,
        netAgentPayout: locationInfo.totalAgentPayout,
        agentPayout,
        merchantHeroPayout: 0 // Only Merchant Hero gets this
      });
    });

    // Calculate Merchant Hero's auto-calculated earnings and BPS
    if (merchantHeroAssignment) {
      const merchantHeroPayout = Math.max(0, locationInfo.totalAgentPayout - totalCommissionsPaid);
      
      // Auto-calculate Merchant Hero's BPS rate based on their earnings
      const merchantHeroBPS = locationInfo.totalVolume > 0 
        ? Math.round((merchantHeroPayout / locationInfo.totalVolume) * 10000) // Convert to BPS
        : 0;
      
      console.log(`Merchant Hero auto-calculation:`, {
        netAgentPayout: locationInfo.totalAgentPayout,
        totalCommissionsPaid,
        merchantHeroPayout,
        autoCalculatedBPS: merchantHeroBPS,
        formula: `(${merchantHeroPayout} / ${locationInfo.totalVolume}) × 10000 = ${merchantHeroBPS} BPS`
      });

      commissions.push({
        locationId: merchantHeroAssignment.location_id,
        locationName: location.name,
        agentName: merchantHeroAssignment.agent_name,
        bpsRate: merchantHeroBPS, // Auto-calculated BPS
        decimalRate: merchantHeroPayout / locationInfo.totalVolume, // Auto-calculated decimal rate
        locationVolume: locationInfo.totalVolume,
        netAgentPayout: locationInfo.totalAgentPayout,
        agentPayout: 0, // Merchant Hero doesn't have agent_payout, they get the remainder
        merchantHeroPayout
      });
    }
  });

  console.log('🎉 Final commissions calculated:', commissions);
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
    
    // For Merchant Hero, use merchantHeroPayout; for others, use agentPayout
    const commissionAmount = commission.agentName === 'Merchant Hero' 
      ? commission.merchantHeroPayout 
      : commission.agentPayout;
    
    acc[commission.agentName].totalCommission += commissionAmount;
    
    return acc;
  }, {} as Record<string, AgentLocationSummary>);

  return Object.values(grouped).sort((a, b) => b.totalCommission - a.totalCommission);
};
