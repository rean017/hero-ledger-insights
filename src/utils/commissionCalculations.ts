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
  console.log('=== ENHANCED GREENLIGHT DEBUGGING ===');
  console.log('Total transactions:', transactions.length);
  console.log('Total assignments:', assignments.length);
  console.log('Total locations:', locations.length);
  
  // ENHANCED: Special tracking for Greenlight & Company
  const greenlightLocations = locations.filter(loc => 
    loc.name.toLowerCase().includes('greenlight')
  );
  
  console.log('🎯 GREENLIGHT LOCATIONS FOUND:', greenlightLocations.length);
  greenlightLocations.forEach(loc => {
    console.log(`  - ID: ${loc.id}, Account: ${loc.account_id}, Name: "${loc.name}"`);
  });

  const greenlightTransactions = transactions.filter(t => {
    const matchingLocation = locations.find(loc => loc.account_id === t.account_id);
    return matchingLocation && matchingLocation.name.toLowerCase().includes('greenlight');
  });

  console.log('🎯 GREENLIGHT TRANSACTIONS FOUND:', greenlightTransactions.length);
  greenlightTransactions.forEach(t => {
    const bankVolume = Number(t.volume) || 0;
    const debitVolume = Number(t.debit_volume) || 0;
    const totalVolume = bankVolume + debitVolume;
    console.log(`  - Account: ${t.account_id}, Bank: ${bankVolume}, Debit: ${debitVolume}, Total: ${totalVolume}, Agent Payout: ${t.agent_payout}`);
  });

  const commissions: LocationCommission[] = [];

  // ENHANCED: Debug location name duplicates
  const locationNameCounts = locations.reduce((acc, location) => {
    const name = location.name;
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('🔍 LOCATION NAME ANALYSIS:');
  Object.entries(locationNameCounts).forEach(([name, count]) => {
    if (count > 1) {
      console.log(`⚠️ DUPLICATE LOCATION NAME DETECTED: "${name}" appears ${count} times`);
      const duplicateLocations = locations.filter(loc => loc.name === name);
      duplicateLocations.forEach(loc => {
        console.log(`  - ID: ${loc.id}, Account ID: ${loc.account_id}, Name: "${loc.name}"`);
        
        // Check if this duplicate has any transactions
        const accountTransactions = transactions.filter(t => t.account_id === loc.account_id);
        const totalVol = accountTransactions.reduce((sum, t) => {
          return sum + (Number(t.volume) || 0) + (Number(t.debit_volume) || 0);
        }, 0);
        console.log(`    Transactions for this account: ${accountTransactions.length}, Total Volume: ${totalVol}`);
      });
    }
  });

  // ENHANCED: Filter out zero-volume transactions at the transaction level first
  const nonZeroTransactions = transactions.filter(transaction => {
    const bankCardVolume = Number(transaction.volume) || 0;
    const debitCardVolume = Number(transaction.debit_volume) || 0;
    const totalVolume = bankCardVolume + debitCardVolume;
    
    if (totalVolume === 0) {
      // Special logging for Greenlight zero-volume transactions
      const matchingLocation = locations.find(loc => loc.account_id === transaction.account_id);
      if (matchingLocation && matchingLocation.name.toLowerCase().includes('greenlight')) {
        console.log(`🚫 FILTERING OUT GREENLIGHT ZERO VOLUME: Account ${transaction.account_id}, Name: "${matchingLocation.name}"`);
      }
      return false;
    }
    return true;
  });

  console.log(`📊 VOLUME FILTERING RESULTS: ${transactions.length} total transactions, ${nonZeroTransactions.length} with volume > 0, ${transactions.length - nonZeroTransactions.length} filtered out`);

  // Group transactions by location (account_id) and calculate totals - ONLY use non-zero transactions
  const locationData = nonZeroTransactions.reduce((acc, transaction) => {
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
    
    // Special logging for Greenlight
    const matchingLocation = locations.find(loc => loc.account_id === accountId);
    if (matchingLocation && matchingLocation.name.toLowerCase().includes('greenlight')) {
      console.log(`💰 GREENLIGHT TRANSACTION PROCESSED: Account ${accountId}, Volume: ${totalTransactionVolume}, Net Payout: ${agentPayout}`);
    }
    
    return acc;
  }, {} as Record<string, LocationData>);

  console.log('📊 ENHANCED LOCATION DATA SUMMARY (AFTER ZERO-VOLUME FILTERING):');
  Object.entries(locationData).forEach(([accountId, data]) => {
    const location = locations.find(loc => loc.account_id === accountId);
    const locationName = location ? location.name : 'UNKNOWN';
    console.log(`📍 Account ID: ${accountId}, Name: "${locationName}", Volume: $${data.totalVolume.toLocaleString()}, Transactions: ${data.transactionCount}`);
    
    // Special check for Greenlight & Company
    if (locationName.toLowerCase().includes('greenlight')) {
      console.log(`🎯 GREENLIGHT FOUND WITH VOLUME: Account ID: ${accountId}, Name: "${locationName}", Volume: $${data.totalVolume.toLocaleString()}`);
    }
  });

  // ENHANCED: Check why Greenlight might not be appearing in locationData
  greenlightLocations.forEach(loc => {
    if (!locationData[loc.account_id]) {
      console.log(`🚨 GREENLIGHT LOCATION NOT IN LOCATION DATA: "${loc.name}" (Account: ${loc.account_id})`);
      console.log(`   Checking if any transactions exist for this account...`);
      
      const allTransactionsForAccount = transactions.filter(t => t.account_id === loc.account_id);
      console.log(`   Total transactions for account ${loc.account_id}: ${allTransactionsForAccount.length}`);
      
      allTransactionsForAccount.forEach((t, index) => {
        const bankVol = Number(t.volume) || 0;
        const debitVol = Number(t.debit_volume) || 0;
        const totalVol = bankVol + debitVol;
        console.log(`     Transaction ${index + 1}: Bank=${bankVol}, Debit=${debitVol}, Total=${totalVol}, Agent Payout=${t.agent_payout}`);
      });
      
      const nonZeroForAccount = allTransactionsForAccount.filter(t => {
        const totalVol = (Number(t.volume) || 0) + (Number(t.debit_volume) || 0);
        return totalVol > 0;
      });
      console.log(`   Non-zero volume transactions for this account: ${nonZeroForAccount.length}`);
    }
  });

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
      console.log(`⚠️ No transaction data found for location ${location.name} (${location.account_id}) - this location had ZERO volume and was filtered out`);
      // CHANGED: Don't create zero-value entries anymore - completely skip locations with no volume
      return;
    }

    // ENHANCED: Double-check that we're not processing zero-volume locations
    if (locationInfo.totalVolume === 0) {
      console.log(`🚫 SKIPPING ZERO VOLUME LOCATION: ${location.name} (Account: ${location.account_id})`);
      return;
    }

    console.log(`💼 Processing location: ${location.name} with volume: $${locationInfo.totalVolume.toLocaleString()}`);
    console.log(`📈 Location data:`, {
      totalVolume: locationInfo.totalVolume,
      netAgentPayout: locationInfo.totalAgentPayout
    });

    // Special logging for Greenlight & Company
    if (location.name.toLowerCase().includes('greenlight')) {
      console.log(`🎯 PROCESSING GREENLIGHT WITH ACTUAL VOLUME: ${location.name}, Account ID: ${location.account_id}, Volume: $${locationInfo.totalVolume.toLocaleString()}`);
    }

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

  // ENHANCED: Final summary with volume verification
  console.log('🎉 FINAL COMMISSION SUMMARY (ZERO-VOLUME FILTERED):');
  const locationVolumeSummary = commissions.reduce((acc, commission) => {
    const name = commission.locationName;
    if (!acc[name]) {
      acc[name] = { volume: 0, count: 0, locations: [] };
    }
    acc[name].volume += commission.locationVolume;
    acc[name].count += 1;
    acc[name].locations.push({
      id: commission.locationId,
      volume: commission.locationVolume
    });
    return acc;
  }, {} as Record<string, { volume: number; count: number; locations: Array<{id: string; volume: number}> }>);

  Object.entries(locationVolumeSummary).forEach(([name, summary]) => {
    if (summary.volume === 0) {
      console.log(`⚠️ WARNING: Location "${name}" has commission entries but ZERO total volume - this should not happen!`);
    } else if (name.toLowerCase().includes('greenlight')) {
      console.log(`✅ GREENLIGHT FINAL VERIFIED: "${name}", Total Volume: $${summary.volume.toLocaleString()}, Entries: ${summary.count}`);
    }
  });

  // ENHANCED: Final check - is Greenlight missing from final results?
  const greenlightInResults = commissions.filter(c => c.locationName.toLowerCase().includes('greenlight'));
  console.log(`🎯 GREENLIGHT IN FINAL RESULTS: ${greenlightInResults.length} entries`);
  
  if (greenlightInResults.length === 0) {
    console.log(`🚨 GREENLIGHT MISSING FROM FINAL RESULTS!`);
    console.log(`🔍 Re-checking Greenlight locations and assignments...`);
    
    greenlightLocations.forEach(loc => {
      const assignments = assignmentsByLocation[loc.id] || [];
      console.log(`  Location: ${loc.name} (${loc.id})`);
      console.log(`    Account ID: ${loc.account_id}`);
      console.log(`    Assignments: ${assignments.length}`);
      console.log(`    Location Data Exists: ${!!locationData[loc.account_id]}`);
      if (locationData[loc.account_id]) {
        console.log(`    Volume in Location Data: ${locationData[loc.account_id].totalVolume}`);
      }
    });
  }

  // ENHANCED: Verify no zero-volume entries made it through
  const zeroVolumeCommissions = commissions.filter(c => c.locationVolume === 0);
  if (zeroVolumeCommissions.length > 0) {
    console.log(`🚨 ERROR: Found ${zeroVolumeCommissions.length} commission entries with zero volume - this indicates a bug!`);
    zeroVolumeCommissions.forEach(c => {
      console.log(`  - ${c.locationName} (${c.locationId}): $${c.locationVolume}`);
    });
  }

  console.log('🎉 Final commissions calculated:', commissions.length);
  console.log('🎉 All entries have volume > $0:', commissions.every(c => c.locationVolume > 0));
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
