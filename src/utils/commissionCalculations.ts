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
  transaction_date?: string;
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
  console.log('🚨 === GREENLIGHT DEBUGGING SESSION START ===');
  console.log('📊 INPUT DATA SUMMARY:');
  console.log('- Total transactions received:', transactions.length);
  console.log('- Total assignments received:', assignments.length);
  console.log('- Total locations received:', locations.length);
  
  // STEP 1: Find ALL Greenlight locations
  const greenlightLocations = locations.filter(loc => 
    loc.name.toLowerCase().includes('greenlight')
  );
  
  console.log('🎯 STEP 1 - GREENLIGHT LOCATIONS FOUND:', greenlightLocations.length);
  greenlightLocations.forEach((loc, index) => {
    console.log(`  ${index + 1}. ID: ${loc.id}, Account: ${loc.account_id}, Name: "${loc.name}"`);
  });

  // STEP 2: Find ALL transactions for Greenlight account IDs
  console.log('🎯 STEP 2 - SEARCHING FOR GREENLIGHT TRANSACTIONS...');
  const greenlightAccountIds = greenlightLocations.map(loc => loc.account_id);
  console.log('Greenlight account IDs to search for:', greenlightAccountIds);

  const allGreenlightTransactions = transactions.filter(t => 
    greenlightAccountIds.includes(t.account_id)
  );

  console.log('🎯 GREENLIGHT TRANSACTIONS FOUND:', allGreenlightTransactions.length);
  
  // CRITICAL: Show ALL transaction dates in the system
  console.log('📅 ALL TRANSACTION DATES IN SYSTEM:');
  const allUniqueDates = [...new Set(transactions.map(t => t.transaction_date))].filter(Boolean).sort();
  console.log('Unique transaction dates found:', allUniqueDates);
  
  // Show what years we have data for
  const years = [...new Set(allUniqueDates.map(date => date ? new Date(date).getFullYear() : null))].filter(Boolean);
  console.log('Years with transaction data:', years);
  
  // DETAILED Greenlight transaction analysis
  if (allGreenlightTransactions.length > 0) {
    console.log('🎯 GREENLIGHT TRANSACTION DETAILS:');
    allGreenlightTransactions.forEach((t, index) => {
      const bankVolume = Number(t.volume) || 0;
      const debitVolume = Number(t.debit_volume) || 0;
      const totalVolume = bankVolume + debitVolume;
      console.log(`  ${index + 1}. Account: ${t.account_id}, Date: ${t.transaction_date}, Bank: $${bankVolume}, Debit: $${debitVolume}, Total: $${totalVolume}, Agent Payout: $${t.agent_payout}`);
    });
    
    const totalGreenlightVolume = allGreenlightTransactions.reduce((sum, t) => {
      const bankVolume = Number(t.volume) || 0;
      const debitVolume = Number(t.debit_volume) || 0;
      return sum + bankVolume + debitVolume;
    }, 0);
    console.log('🎯 TOTAL GREENLIGHT VOLUME FROM ALL TRANSACTIONS: $', totalGreenlightVolume);
  } else {
    console.log('🚨 NO GREENLIGHT TRANSACTIONS FOUND AT ALL!');
    
    // Debug why no transactions found
    console.log('🔍 DEBUGGING NO GREENLIGHT TRANSACTIONS:');
    console.log('All account IDs in transactions:', [...new Set(transactions.map(t => t.account_id))]);
    console.log('Greenlight account IDs we are looking for:', greenlightAccountIds);
    
    // Check if any account IDs are similar to Greenlight account IDs
    const allAccountIds = [...new Set(transactions.map(t => t.account_id))];
    greenlightAccountIds.forEach(greenlightId => {
      console.log(`Looking for Greenlight account ${greenlightId} in transaction data...`);
      const found = allAccountIds.find(id => id === greenlightId);
      if (!found) {
        console.log(`❌ Account ${greenlightId} NOT found in transaction data`);
        // Look for similar account IDs
        const similar = allAccountIds.filter(id => id && id.includes(greenlightId.slice(-6)));
        if (similar.length > 0) {
          console.log(`🔍 Similar account IDs found:`, similar);
        }
      } else {
        console.log(`✅ Account ${greenlightId} found in transaction data`);
      }
    });
  }

  // Enhanced: Pre-filter zero-volume transactions at the transaction level
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

  console.log(`📊 VOLUME FILTERING RESULTS: ${transactions.length} total → ${nonZeroTransactions.length} with volume > 0`);

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
      console.log(`💰 GREENLIGHT TRANSACTION ADDED TO LOCATION DATA: Account ${accountId}, Volume: $${totalTransactionVolume}, Running Total: $${acc[accountId].totalVolume}`);
    }
    
    return acc;
  }, {} as Record<string, LocationData>);

  // STEP 5: Verify Greenlight made it into locationData
  console.log('🎯 STEP 5 - GREENLIGHT IN LOCATION DATA CHECK...');
  greenlightLocations.forEach(loc => {
    const locationInfo = locationData[loc.account_id];
    if (locationInfo) {
      console.log(`✅ GREENLIGHT FOUND IN LOCATION DATA: "${loc.name}" - Volume: $${locationInfo.totalVolume}, Transactions: ${locationInfo.transactionCount}`);
    } else {
      console.log(`🚨 GREENLIGHT MISSING FROM LOCATION DATA: "${loc.name}" (Account: ${loc.account_id})`);
      
      // Deep dive into why it's missing
      const accountTransactions = transactions.filter(t => t.account_id === loc.account_id);
      console.log(`   Raw transactions for this account: ${accountTransactions.length}`);
      
      if (accountTransactions.length > 0) {
        console.log(`   First few transactions for account ${loc.account_id}:`);
        accountTransactions.slice(0, 5).forEach((t, i) => {
          const bankVol = Number(t.volume) || 0;
          const debitVol = Number(t.debit_volume) || 0;
          const totalVol = bankVol + debitVol;
          console.log(`     ${i + 1}. Date: ${t.transaction_date}, Bank: $${bankVol}, Debit: $${debitVol}, Total: $${totalVol}`);
        });
      }
    }
  });

  const commissions: LocationCommission[] = [];

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
      // Special check for Greenlight
      if (location.name.toLowerCase().includes('greenlight')) {
        console.log(`🚨 GREENLIGHT LOCATION SKIPPED - NO LOCATION DATA: "${location.name}" (Account: ${location.account_id})`);
      }
      return;
    }

    // Enhanced: Double-check that we're not processing zero-volume locations
    if (locationInfo.totalVolume === 0) {
      console.log(`🚫 SKIPPING ZERO VOLUME LOCATION: ${location.name} (Account: ${location.account_id})`);
      return;
    }

    console.log(`💼 Processing location: ${location.name} with volume: $${locationInfo.totalVolume.toLocaleString()}`);

    // Special logging for Greenlight & Company
    if (location.name.toLowerCase().includes('greenlight')) {
      console.log(`🎯 ✅ PROCESSING GREENLIGHT WITH ACTUAL VOLUME: ${location.name}, Account ID: ${location.account_id}, Volume: $${locationInfo.totalVolume.toLocaleString()}`);
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

  // STEP 6: Final verification
  console.log('🎯 STEP 6 - FINAL GREENLIGHT VERIFICATION...');
  const greenlightInFinalResults = commissions.filter(c => c.locationName.toLowerCase().includes('greenlight'));
  console.log(`Greenlight entries in final commissions: ${greenlightInFinalResults.length}`);
  
  if (greenlightInFinalResults.length > 0) {
    greenlightInFinalResults.forEach(commission => {
      console.log(`✅ FINAL GREENLIGHT COMMISSION: ${commission.locationName}, Volume: $${commission.locationVolume}, Agent: ${commission.agentName}`);
    });
  } else {
    console.log('🚨 GREENLIGHT COMPLETELY MISSING FROM FINAL RESULTS!');
    
    // Final diagnostic
    console.log('🔍 FINAL DIAGNOSTIC:');
    console.log('1. Greenlight locations found:', greenlightLocations.length);
    console.log('2. Greenlight transactions found:', allGreenlightTransactions.length);
    console.log('3. Greenlight in locationData:', greenlightLocations.some(loc => locationData[loc.account_id]));
    console.log('4. Greenlight assignments exist:', greenlightLocations.some(loc => assignmentsByLocation[loc.id]));
    
    // Show the exact mismatch
    if (greenlightLocations.length > 0) {
      const greenlightLoc = greenlightLocations[0];
      console.log('🔍 DEBUGGING FIRST GREENLIGHT LOCATION:');
      console.log('- Location ID:', greenlightLoc.id);
      console.log('- Account ID:', greenlightLoc.account_id);
      console.log('- Has location data:', !!locationData[greenlightLoc.account_id]);
      console.log('- Has assignments:', !!assignmentsByLocation[greenlightLoc.id]);
      console.log('- Location data keys:', Object.keys(locationData));
      console.log('- Assignment keys:', Object.keys(assignmentsByLocation));
    }
  }

  console.log('🚨 === GREENLIGHT DEBUGGING SESSION END ===');
  console.log('🎉 Final commissions calculated:', commissions.length);
  
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
