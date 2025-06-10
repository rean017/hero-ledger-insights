
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
  console.log('=== ENHANCED VOLUME DEBUGGING FOR TRNXN ===');
  console.log('Total transactions:', transactions.length);
  console.log('Total assignments:', assignments.length);
  console.log('Total locations:', locations.length);
  
  // Debug: Show sample transaction data with volume details
  if (transactions.length > 0) {
    console.log('Sample transaction data (first 3):', transactions.slice(0, 3));
    console.log('Transaction fields available:', Object.keys(transactions[0]));
    
    // Specifically check for volume columns
    transactions.slice(0, 5).forEach((t, index) => {
      const bankCard = Number(t.volume) || 0;
      const debitCard = Number(t.debit_volume) || 0;
      console.log(`Transaction ${index + 1} VOLUME DEBUG:`, {
        account_id: t.account_id,
        processor: t.processor,
        raw_volume: t.volume,
        raw_debit_volume: t.debit_volume,
        parsed_bank_card: bankCard,
        parsed_debit_card: debitCard,
        calculated_total: bankCard + debitCard
      });
    });
  }
  
  const commissions: LocationCommission[] = [];

  // Group transactions by location (account_id) and calculate totals with enhanced debugging
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
    
    // ENHANCED: Parse and validate both volume columns
    const rawBankCardVolume = transaction.volume;
    const rawDebitCardVolume = transaction.debit_volume;
    
    console.log(`🔍 RAW VOLUME DATA for account ${accountId}:`, {
      raw_volume: rawBankCardVolume,
      raw_debit_volume: rawDebitCardVolume,
      volume_type: typeof rawBankCardVolume,
      debit_volume_type: typeof rawDebitCardVolume
    });
    
    const bankCardVolume = Number(rawBankCardVolume) || 0;
    const debitCardVolume = Number(rawDebitCardVolume) || 0;
    
    // Validate the parsed numbers
    if (isNaN(bankCardVolume)) {
      console.log(`❌ Invalid bank card volume for account ${accountId}:`, rawBankCardVolume);
    }
    if (isNaN(debitCardVolume)) {
      console.log(`❌ Invalid debit card volume for account ${accountId}:`, rawDebitCardVolume);
    }
    
    const totalTransactionVolume = bankCardVolume + debitCardVolume;
    
    acc[accountId].totalVolume += totalTransactionVolume;
    acc[accountId].bankCardTotal += bankCardVolume;
    acc[accountId].debitCardTotal += debitCardVolume;
    acc[accountId].transactionCount += 1;
    
    console.log(`📊 ENHANCED VOLUME CALCULATION for account ${accountId}:`, {
      transaction_number: acc[accountId].transactionCount,
      bank_card_this_transaction: bankCardVolume,
      debit_card_this_transaction: debitCardVolume,
      total_this_transaction: totalTransactionVolume,
      running_bank_card_total: acc[accountId].bankCardTotal,
      running_debit_card_total: acc[accountId].debitCardTotal,
      running_total_volume: acc[accountId].totalVolume
    });
    
    // agent_payout is what Merchant Hero receives on this transaction
    const agentPayout = Number(transaction.agent_payout) || 0;
    acc[accountId].totalAgentPayout += agentPayout;
    
    // Debug logging for agent_payout
    if (agentPayout > 0) {
      console.log(`Found agent_payout for account ${accountId}:`, agentPayout);
    }
    
    return acc;
  }, {} as Record<string, LocationData>);

  console.log('🎯 ENHANCED FINAL LOCATION VOLUME DATA:', locationData);

  // Enhanced debug: Check total volumes across all locations with breakdown
  const allLocationTotals = Object.entries(locationData).map(([accountId, data]: [string, LocationData]) => ({
    accountId,
    totalVolume: data.totalVolume,
    bankCardTotal: data.bankCardTotal,
    debitCardTotal: data.debitCardTotal,
    transactionCount: data.transactionCount,
    totalAgentPayout: data.totalAgentPayout,
    verification: data.bankCardTotal + data.debitCardTotal === data.totalVolume
  }));
  console.log('📊 ENHANCED LOCATION TOTALS WITH BREAKDOWN:', allLocationTotals);
  
  const grandTotalVolume = allLocationTotals.reduce((sum, loc) => sum + loc.totalVolume, 0);
  const grandTotalBankCard = allLocationTotals.reduce((sum, loc) => sum + loc.bankCardTotal, 0);
  const grandTotalDebitCard = allLocationTotals.reduce((sum, loc) => sum + loc.debitCardTotal, 0);
  
  console.log(`🏆 GRAND TOTALS VERIFICATION:`);
  console.log(`   Bank Card Total (H): ${grandTotalBankCard}`);
  console.log(`   Debit Card Total (I): ${grandTotalDebitCard}`);
  console.log(`   Combined Total (H+I): ${grandTotalBankCard + grandTotalDebitCard}`);
  console.log(`   Calculated Total: ${grandTotalVolume}`);
  console.log(`   ✅ VERIFICATION: ${grandTotalVolume === (grandTotalBankCard + grandTotalDebitCard) ? 'PASSED' : 'FAILED'}`);

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
    console.log(`📈 Location ENHANCED volume breakdown:`, {
      bankCardTotal: locationInfo.bankCardTotal,
      debitCardTotal: locationInfo.debitCardTotal,
      calculatedTotal: locationInfo.totalVolume,
      verification: locationInfo.bankCardTotal + locationInfo.debitCardTotal,
      matches: locationInfo.totalVolume === (locationInfo.bankCardTotal + locationInfo.debitCardTotal)
    });

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
  
  // Enhanced final volume verification
  const finalVolumeTotals = commissions.reduce((acc, commission) => {
    acc[commission.locationName] = commission.locationVolume;
    return acc;
  }, {} as Record<string, number>);
  console.log('🔍 FINAL VOLUME TOTALS BY LOCATION:', finalVolumeTotals);
  
  const finalGrandTotal = Object.values(finalVolumeTotals).reduce((sum, vol) => sum + vol, 0);
  console.log(`🎯 FINAL GRAND TOTAL VERIFICATION: ${finalGrandTotal}`);
  console.log(`🎯 EXPECTED TOTAL (should match): ${grandTotalVolume}`);
  console.log(`🎯 MATCH: ${finalGrandTotal === grandTotalVolume ? '✅ YES' : '❌ NO'}`);
  
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
