
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

export const calculateLocationCommissions = (
  transactions: any[],
  assignments: any[],
  locations: any[]
): LocationCommission[] => {
  console.log('=== COMMISSION CALCULATION WITH BPS SYSTEM ===');
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

  // Calculate commissions for each active assignment using YOUR EXACT FORMULA
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

    const locationInfo = locationData[location.account_id];
    if (!locationInfo) {
      console.log(`No transaction data found for location ${location.name} (${location.account_id})`);
      // Create zero-value entries for display
      commissions.push({
        locationId: assignment.location_id,
        locationName: location.name,
        agentName: assignment.agent_name,
        bpsRate: Math.round(assignment.commission_rate * 100),
        decimalRate: convertToDecimalRate(assignment.commission_rate),
        locationVolume: 0,
        netAgentPayout: 0,
        agentPayout: 0,
        merchantHeroPayout: 0
      });
      return;
    }

    console.log(`💼 Processing assignment: ${assignment.agent_name} at ${location.name}`);
    console.log(`📈 Location data:`, {
      totalVolume: locationInfo.totalVolume,
      netAgentPayout: locationInfo.totalAgentPayout
    });

    if (assignment.agent_name === 'Merchant Hero') {
      // For Merchant Hero, calculate what's left after paying other agents
      const otherAgentAssignments = assignments.filter(a => 
        a.is_active && 
        a.location_id === assignment.location_id && 
        a.agent_name !== 'Merchant Hero'
      );
      
      let totalCommissionsPaid = 0;
      otherAgentAssignments.forEach(otherAssignment => {
        // YOUR EXACT FORMULA: agent_payout = total_volume * (bps_rate / 10000)
        const bpsDecimal = otherAssignment.commission_rate / 100; // Convert stored decimal to BPS decimal
        const agentPayout = locationInfo.totalVolume * bpsDecimal;
        totalCommissionsPaid += agentPayout;
        console.log(`  - Commission to ${otherAssignment.agent_name}: ${agentPayout} (${Math.round(otherAssignment.commission_rate * 100)} BPS)`);
      });
      
      // YOUR EXACT FORMULA: merchant_hero_payout = net_agent_payout - agent_payout
      const merchantHeroPayout = Math.max(0, locationInfo.totalAgentPayout - totalCommissionsPaid);
      
      console.log(`Merchant Hero calculation:`, {
        netAgentPayout: locationInfo.totalAgentPayout,
        totalCommissionsPaid,
        merchantHeroPayout
      });

      commissions.push({
        locationId: assignment.location_id,
        locationName: location.name,
        agentName: assignment.agent_name,
        bpsRate: 0, // Merchant Hero gets remainder, not fixed BPS
        decimalRate: 0,
        locationVolume: locationInfo.totalVolume,
        netAgentPayout: locationInfo.totalAgentPayout,
        agentPayout: 0, // Merchant Hero doesn't have agent_payout, they get the remainder
        merchantHeroPayout
      });
    } else {
      // For other agents: YOUR EXACT FORMULA: agent_payout = total_volume * (bps_rate / 10000)
      const bpsDisplay = Math.round(assignment.commission_rate * 100);
      const bpsDecimal = assignment.commission_rate / 100; // Convert stored decimal to calculation decimal
      const agentPayout = locationInfo.totalVolume * bpsDecimal;
      
      console.log(`Agent calculation:`, {
        agentName: assignment.agent_name,
        locationName: location.name,
        totalVolume: locationInfo.totalVolume,
        storedRate: assignment.commission_rate,
        bpsDisplay,
        bpsDecimal,
        agentPayout,
        formula: `${locationInfo.totalVolume} × ${bpsDecimal} = ${agentPayout}`
      });

      commissions.push({
        locationId: assignment.location_id,
        locationName: location.name,
        agentName: assignment.agent_name,
        bpsRate: bpsDisplay,
        decimalRate: bpsDecimal,
        locationVolume: locationInfo.totalVolume,
        netAgentPayout: locationInfo.totalAgentPayout,
        agentPayout,
        merchantHeroPayout: 0 // Only Merchant Hero gets this
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
