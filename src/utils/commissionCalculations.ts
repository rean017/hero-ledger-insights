
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
  
  // Debug: Show sample transaction data
  if (transactions.length > 0) {
    console.log('Sample transaction data:', transactions.slice(0, 3));
    console.log('Transaction fields available:', Object.keys(transactions[0]));
  }
  
  const commissions: LocationCommission[] = [];

  // Group transactions by location (account_id) and calculate totals
  const locationData = transactions.reduce((acc, transaction) => {
    const accountId = transaction.account_id;
    if (!accountId) return acc;
    
    if (!acc[accountId]) {
      acc[accountId] = {
        totalVolume: 0,
        totalAgentPayout: 0 // This is what Merchant Hero receives
      };
    }
    
    // CRITICAL FIX: Properly handle both volume columns for ALL processors
    const bankCardVolume = Number(transaction.volume) || 0;
    const debitCardVolume = Number(transaction.debit_volume) || 0;
    
    // For TRNXN and other processors that have separate debit volume, add both
    // For processors that only have one volume column, debit_volume will be 0
    const totalTransactionVolume = bankCardVolume + debitCardVolume;
    
    acc[accountId].totalVolume += totalTransactionVolume;
    
    console.log(`🔍 VOLUME CALCULATION DEBUG for account ${accountId}:`);
    console.log(`  - Bank Card Volume (from 'volume' column): ${bankCardVolume}`);
    console.log(`  - Debit Card Volume (from 'debit_volume' column): ${debitCardVolume}`);
    console.log(`  - Transaction Total Volume (H + I): ${totalTransactionVolume}`);
    console.log(`  - Running Location Total: ${acc[accountId].totalVolume}`);
    
    // agent_payout is what Merchant Hero receives on this transaction
    const agentPayout = Number(transaction.agent_payout) || 0;
    acc[accountId].totalAgentPayout += agentPayout;
    
    // Debug logging for agent_payout
    if (agentPayout > 0) {
      console.log(`Found agent_payout for account ${accountId}:`, agentPayout);
    }
    
    return acc;
  }, {} as Record<string, { totalVolume: number; totalAgentPayout: number }>);

  console.log('🎯 FINAL LOCATION VOLUME DATA:', locationData);

  // Debug: Check total volumes across all locations - Fixed typing
  const allLocationTotals = Object.entries(locationData).map(([accountId, data]) => ({
    accountId,
    totalVolume: (data as { totalVolume: number; totalAgentPayout: number }).totalVolume,
    totalAgentPayout: (data as { totalVolume: number; totalAgentPayout: number }).totalAgentPayout
  }));
  console.log('📊 ALL LOCATION TOTALS:', allLocationTotals);
  
  const grandTotalVolume = allLocationTotals.reduce((sum, loc) => sum + loc.totalVolume, 0);
  console.log(`🏆 GRAND TOTAL VOLUME ACROSS ALL LOCATIONS: ${grandTotalVolume}`);

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

    const locationInfo = locationData[location.account_id];
    if (!locationInfo) {
      console.log(`No transaction data found for location ${location.name} (${location.account_id})`);
      // Still create a commission entry with zero values for display purposes
      if (assignment.agent_name === 'Merchant Hero') {
        commissions.push({
          locationId: assignment.location_id,
          locationName: location.name,
          agentName: assignment.agent_name,
          bpsRate: 0,
          decimalRate: 0,
          locationVolume: 0,
          commission: 0
        });
      } else {
        const decimalRate = convertToDecimalRate(assignment.commission_rate);
        const displayBPS = Math.round(assignment.commission_rate * 100);
        commissions.push({
          locationId: assignment.location_id,
          locationName: location.name,
          agentName: assignment.agent_name,
          bpsRate: displayBPS,
          decimalRate,
          locationVolume: 0,
          commission: 0
        });
      }
      return;
    }

    console.log(`💰 Processing assignment: ${assignment.agent_name} at ${location.name}`);
    console.log(`📈 Location calculated total volume (Bank Card + Debit Card): ${locationInfo.totalVolume}`);

    if (assignment.agent_name === 'Merchant Hero') {
      console.log(`DEBUG: Merchant Hero calculation for ${location.name}:`);
      console.log('  - Location volume:', locationInfo.totalVolume);
      console.log('  - Agent payout available:', locationInfo.totalAgentPayout);
      
      // For Merchant Hero, they get the total agent_payout minus commissions paid to other agents
      const otherAgentAssignments = assignments.filter(a => 
        a.is_active && 
        a.location_id === assignment.location_id && 
        a.agent_name !== 'Merchant Hero'
      );
      
      let totalCommissionsPaid = 0;
      otherAgentAssignments.forEach(otherAssignment => {
        const decimalRate = convertToDecimalRate(otherAssignment.commission_rate);
        const commission = locationInfo.totalVolume * decimalRate;
        totalCommissionsPaid += commission;
        console.log(`  - Commission to ${otherAssignment.agent_name}: ${commission}`);
      });
      
      // If no agent_payout data, calculate based on a default rate
      let merchantHeroNet = 0;
      if (locationInfo.totalAgentPayout > 0) {
        // Use actual agent_payout data
        merchantHeroNet = locationInfo.totalAgentPayout - totalCommissionsPaid;
        console.log(`  - Using agent_payout data: ${locationInfo.totalAgentPayout} - ${totalCommissionsPaid} = ${merchantHeroNet}`);
      } else if (locationInfo.totalVolume > 0) {
        // Fallback: assume a 2% margin for Merchant Hero when no agent_payout data
        const estimatedPayout = locationInfo.totalVolume * 0.02; // 2% assumption
        merchantHeroNet = estimatedPayout - totalCommissionsPaid;
        console.log(`  - No agent_payout data, using 2% estimate: ${estimatedPayout} - ${totalCommissionsPaid} = ${merchantHeroNet}`);
      }
      
      console.log(`Merchant Hero final calculation for ${location.name}:`, {
        totalAgentPayout: locationInfo.totalAgentPayout,
        totalCommissionsPaid,
        merchantHeroNet,
        locationVolume: locationInfo.totalVolume
      });

      commissions.push({
        locationId: assignment.location_id,
        locationName: location.name,
        agentName: assignment.agent_name,
        bpsRate: 0, // Merchant Hero doesn't have a fixed BPS rate - gets remainder
        decimalRate: 0,
        locationVolume: locationInfo.totalVolume,
        commission: Math.max(0, merchantHeroNet) // Ensure commission is not negative
      });
    } else {
      // For other agents, use the standard BPS calculation on volume
      const decimalRate = convertToDecimalRate(assignment.commission_rate);
      const displayBPS = Math.round(assignment.commission_rate * 100);
      const commission = locationInfo.totalVolume * decimalRate;
      
      console.log(`Standard agent calculation:`, {
        agentName: assignment.agent_name,
        locationName: location.name,
        locationVolume: locationInfo.totalVolume,
        storedRate: assignment.commission_rate,
        displayBPS,
        decimalRate,
        commission,
        formula: `${locationInfo.totalVolume} × ${decimalRate} = ${commission}`
      });

      commissions.push({
        locationId: assignment.location_id,
        locationName: location.name,
        agentName: assignment.agent_name,
        bpsRate: displayBPS,
        decimalRate,
        locationVolume: locationInfo.totalVolume,
        commission
      });
    }
  });

  console.log('🎉 Final commissions calculated:', commissions);
  
  // Log final volume totals for verification
  const finalVolumeTotals = commissions.reduce((acc, commission) => {
    acc[commission.locationName] = commission.locationVolume;
    return acc;
  }, {} as Record<string, number>);
  console.log('🔍 FINAL VOLUME TOTALS BY LOCATION:', finalVolumeTotals);
  
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
