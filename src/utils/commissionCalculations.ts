
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
  console.log('🚨 === FIXED GREENLIGHT DEBUGGING SESSION START ===');
  console.log('📊 INPUT DATA SUMMARY:');
  console.log('- Total transactions received:', transactions.length);
  console.log('- Total assignments received:', assignments.length);
  console.log('- Total locations received:', locations.length);
  
  // STEP 1: Find Greenlight locations and show their account IDs
  const greenlightLocations = locations.filter(loc => 
    loc.name.toLowerCase().includes('greenlight')
  );
  
  console.log('🎯 GREENLIGHT LOCATIONS FOUND:', greenlightLocations.length);
  greenlightLocations.forEach((loc, index) => {
    console.log(`  ${index + 1}. ID: ${loc.id}, Account: "${loc.account_id}", Name: "${loc.name}"`);
  });

  // STEP 2: Check what account IDs we have in transactions
  const allTransactionAccountIds = [...new Set(transactions.map(t => t.account_id))].sort();
  console.log('📊 ALL UNIQUE ACCOUNT IDs IN TRANSACTIONS:', allTransactionAccountIds);
  
  // STEP 3: Find transactions that match Greenlight account IDs (with fuzzy matching)
  console.log('🔍 SEARCHING FOR GREENLIGHT TRANSACTIONS...');
  const greenlightAccountIds = greenlightLocations.map(loc => loc.account_id);
  console.log('🎯 Greenlight account IDs to search for:', greenlightAccountIds);

  // Try exact match first
  let greenlightTransactions = transactions.filter(t => 
    greenlightAccountIds.includes(t.account_id)
  );

  console.log('✅ EXACT MATCH GREENLIGHT TRANSACTIONS:', greenlightTransactions.length);

  // If no exact match, try fuzzy matching (remove spaces, hyphens, etc.)
  if (greenlightTransactions.length === 0) {
    console.log('🔍 NO EXACT MATCHES - TRYING FUZZY MATCHING...');
    
    const normalizeId = (id: string) => id.replace(/[\s\-_]/g, '').toLowerCase();
    const normalizedGreenlightIds = greenlightAccountIds.map(id => normalizeId(id));
    
    console.log('🎯 Normalized Greenlight IDs:', normalizedGreenlightIds);
    
    greenlightTransactions = transactions.filter(t => {
      const normalizedTransactionId = normalizeId(t.account_id);
      const found = normalizedGreenlightIds.some(normalizedId => 
        normalizedTransactionId.includes(normalizedId) || normalizedId.includes(normalizedTransactionId)
      );
      if (found) {
        console.log(`🎯 FUZZY MATCH FOUND: Transaction "${t.account_id}" matches Greenlight`);
      }
      return found;
    });
    
    console.log('✅ FUZZY MATCH GREENLIGHT TRANSACTIONS:', greenlightTransactions.length);
  }

  // Show sample Greenlight transactions
  if (greenlightTransactions.length > 0) {
    console.log('🎯 SAMPLE GREENLIGHT TRANSACTIONS:');
    greenlightTransactions.slice(0, 5).forEach((t, index) => {
      const bankVolume = Number(t.volume) || 0;
      const debitVolume = Number(t.debit_volume) || 0;
      const totalVolume = bankVolume + debitVolume;
      console.log(`  ${index + 1}. Account: "${t.account_id}", Date: ${t.transaction_date}, Bank: $${bankVolume}, Debit: $${debitVolume}, Total: $${totalVolume}, Agent Payout: $${t.agent_payout}`);
    });
    
    const totalGreenlightVolume = greenlightTransactions.reduce((sum, t) => {
      const bankVolume = Number(t.volume) || 0;
      const debitVolume = Number(t.debit_volume) || 0;
      return sum + bankVolume + debitVolume;
    }, 0);
    console.log('💰 TOTAL GREENLIGHT VOLUME: $', totalGreenlightVolume.toLocaleString());
  } else {
    console.log('🚨 NO GREENLIGHT TRANSACTIONS FOUND!');
    console.log('🔍 DEBUGGING: Sample transaction account IDs vs Greenlight account IDs:');
    allTransactionAccountIds.slice(0, 10).forEach(transId => {
      console.log(`  Transaction: "${transId}"`);
      greenlightAccountIds.forEach(greenlightId => {
        if (transId && greenlightId && (transId.includes(greenlightId) || greenlightId.includes(transId))) {
          console.log(`    ⚡ POTENTIAL MATCH with Greenlight: "${greenlightId}"`);
        }
      });
    });
  }

  // Filter out zero-volume transactions
  const nonZeroTransactions = transactions.filter(transaction => {
    const bankCardVolume = Number(transaction.volume) || 0;
    const debitCardVolume = Number(transaction.debit_volume) || 0;
    const totalVolume = bankCardVolume + debitCardVolume;
    return totalVolume > 0;
  });

  console.log(`📊 VOLUME FILTERING: ${transactions.length} total → ${nonZeroTransactions.length} with volume > 0`);

  // CRITICAL FIX: Group transactions by location with improved matching
  const locationData = nonZeroTransactions.reduce((acc, transaction) => {
    const accountId = transaction.account_id;
    if (!accountId) return acc;
    
    // Find matching location - try exact match first, then fuzzy match
    let matchingLocation = locations.find(loc => loc.account_id === accountId);
    
    if (!matchingLocation) {
      // Try fuzzy matching for location lookup
      const normalizeId = (id: string) => id.replace(/[\s\-_]/g, '').toLowerCase();
      const normalizedTransactionId = normalizeId(accountId);
      
      matchingLocation = locations.find(loc => {
        if (!loc.account_id) return false;
        const normalizedLocationId = normalizeId(loc.account_id);
        return normalizedTransactionId.includes(normalizedLocationId) || 
               normalizedLocationId.includes(normalizedTransactionId);
      });
    }
    
    // Use the location's account_id as the key (for consistency)
    const locationKey = matchingLocation ? matchingLocation.account_id : accountId;
    
    if (!acc[locationKey]) {
      acc[locationKey] = {
        totalVolume: 0,
        totalAgentPayout: 0,
        bankCardTotal: 0,
        debitCardTotal: 0,
        transactionCount: 0
      };
    }
    
    const bankCardVolume = Number(transaction.volume) || 0;
    const debitCardVolume = Number(transaction.debit_volume) || 0;
    const totalTransactionVolume = bankCardVolume + debitCardVolume;
    
    acc[locationKey].totalVolume += totalTransactionVolume;
    acc[locationKey].bankCardTotal += bankCardVolume;
    acc[locationKey].debitCardTotal += debitCardVolume;
    acc[locationKey].transactionCount += 1;
    
    const agentPayout = Number(transaction.agent_payout) || 0;
    acc[locationKey].totalAgentPayout += agentPayout;
    
    // Special logging for Greenlight
    if (matchingLocation && matchingLocation.name.toLowerCase().includes('greenlight')) {
      console.log(`💰 GREENLIGHT TRANSACTION PROCESSED: Account "${accountId}" → Location "${matchingLocation.name}", Volume: $${totalTransactionVolume}, Running Total: $${acc[locationKey].totalVolume}`);
    }
    
    return acc;
  }, {} as Record<string, LocationData>);

  // VERIFY: Check Greenlight in final location data
  console.log('🎯 FINAL GREENLIGHT VERIFICATION:');
  greenlightLocations.forEach(loc => {
    const locationInfo = locationData[loc.account_id];
    if (locationInfo) {
      console.log(`✅ GREENLIGHT IN FINAL DATA: "${loc.name}" (${loc.account_id}) - Volume: $${locationInfo.totalVolume.toLocaleString()}, Transactions: ${locationInfo.transactionCount}`);
    } else {
      console.log(`❌ GREENLIGHT MISSING: "${loc.name}" (${loc.account_id}) not found in location data`);
      
      // Check if any similar account IDs exist in locationData
      const locationDataKeys = Object.keys(locationData);
      console.log('🔍 Available location data keys:', locationDataKeys);
      
      const similarKeys = locationDataKeys.filter(key => 
        key.includes(loc.account_id.slice(-6)) || loc.account_id.includes(key.slice(-6))
      );
      if (similarKeys.length > 0) {
        console.log(`🔍 Similar keys found for ${loc.account_id}:`, similarKeys);
      }
    }
  });

  const commissions: LocationCommission[] = [];

  // Group assignments by location
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
      console.log('⚠️ Location not found for assignment:', locationId);
      return;
    }

    const locationInfo = locationData[location.account_id];
    if (!locationInfo) {
      console.log(`⚠️ No transaction data for location: ${location.name} (${location.account_id})`);
      return;
    }

    if (locationInfo.totalVolume === 0) {
      console.log(`⚠️ Zero volume for location: ${location.name} (${location.account_id})`);
      return;
    }

    console.log(`💼 Processing location: ${location.name} with volume: $${locationInfo.totalVolume.toLocaleString()}`);

    // Special logging for Greenlight
    if (location.name.toLowerCase().includes('greenlight')) {
      console.log(`🎯 ✅ PROCESSING GREENLIGHT WITH VOLUME: ${location.name}, Account: ${location.account_id}, Volume: $${locationInfo.totalVolume.toLocaleString()}, Transactions: ${locationInfo.transactionCount}`);
    }

    // Calculate commissions
    const otherAgents = locationAssignments.filter(a => a.agent_name !== 'Merchant Hero');
    const merchantHeroAssignment = locationAssignments.find(a => a.agent_name === 'Merchant Hero');
    
    let totalCommissionsPaid = 0;
    
    // Calculate payouts for other agents
    otherAgents.forEach(assignment => {
      const bpsDecimal = assignment.commission_rate / 100;
      const agentPayout = locationInfo.totalVolume * bpsDecimal;
      totalCommissionsPaid += agentPayout;
      
      console.log(`💰 Agent calculation for ${assignment.agent_name}:`, {
        locationName: location.name,
        totalVolume: locationInfo.totalVolume,
        bpsRate: Math.round(assignment.commission_rate * 100),
        agentPayout: agentPayout
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
        merchantHeroPayout: 0
      });
    });

    // Calculate Merchant Hero's earnings
    if (merchantHeroAssignment) {
      const merchantHeroPayout = Math.max(0, locationInfo.totalAgentPayout - totalCommissionsPaid);
      const merchantHeroBPS = locationInfo.totalVolume > 0 
        ? Math.round((merchantHeroPayout / locationInfo.totalVolume) * 10000)
        : 0;
      
      console.log(`💰 Merchant Hero calculation:`, {
        locationName: location.name,
        netAgentPayout: locationInfo.totalAgentPayout,
        totalCommissionsPaid,
        merchantHeroPayout,
        autoCalculatedBPS: merchantHeroBPS
      });

      commissions.push({
        locationId: merchantHeroAssignment.location_id,
        locationName: location.name,
        agentName: merchantHeroAssignment.agent_name,
        bpsRate: merchantHeroBPS,
        decimalRate: merchantHeroPayout / locationInfo.totalVolume,
        locationVolume: locationInfo.totalVolume,
        netAgentPayout: locationInfo.totalAgentPayout,
        agentPayout: 0,
        merchantHeroPayout
      });
    }
  });

  // FINAL CHECK
  const greenlightInFinalResults = commissions.filter(c => c.locationName.toLowerCase().includes('greenlight'));
  console.log(`🎯 FINAL RESULT: ${greenlightInFinalResults.length} Greenlight commission entries found`);
  
  if (greenlightInFinalResults.length > 0) {
    greenlightInFinalResults.forEach(commission => {
      console.log(`✅ GREENLIGHT COMMISSION: ${commission.locationName}, Volume: $${commission.locationVolume.toLocaleString()}, Agent: ${commission.agentName}`);
    });
  } else {
    console.log('🚨 GREENLIGHT STILL MISSING FROM FINAL RESULTS!');
  }

  console.log('🚨 === FIXED GREENLIGHT DEBUGGING SESSION END ===');
  console.log(`🎉 Total commissions calculated: ${commissions.length}`);
  
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
    
    const commissionAmount = commission.agentName === 'Merchant Hero' 
      ? commission.merchantHeroPayout 
      : commission.agentPayout;
    
    acc[commission.agentName].totalCommission += commissionAmount;
    
    return acc;
  }, {} as Record<string, AgentLocationSummary>);

  return Object.values(grouped).sort((a, b) => b.totalCommission - a.totalCommission);
};
