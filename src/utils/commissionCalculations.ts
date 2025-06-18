
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

// Helper function to normalize account IDs for matching
const normalizeAccountId = (accountId: string): string => {
  if (!accountId) return '';
  // Remove all non-alphanumeric characters and convert to lowercase
  return accountId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
};

// Helper function to find matching location for a transaction
const findMatchingLocation = (transactionAccountId: string, locations: Location[]): Location | null => {
  if (!transactionAccountId) return null;
  
  // First try exact match
  let matchingLocation = locations.find(loc => loc.account_id === transactionAccountId);
  if (matchingLocation) return matchingLocation;
  
  // Try normalized matching
  const normalizedTransactionId = normalizeAccountId(transactionAccountId);
  matchingLocation = locations.find(loc => {
    if (!loc.account_id) return false;
    const normalizedLocationId = normalizeAccountId(loc.account_id);
    return normalizedLocationId === normalizedTransactionId;
  });
  
  if (matchingLocation) return matchingLocation;
  
  // Try partial matching (for cases where one ID is contained in another)
  matchingLocation = locations.find(loc => {
    if (!loc.account_id) return false;
    const normalizedLocationId = normalizeAccountId(loc.account_id);
    return normalizedLocationId.includes(normalizedTransactionId) || 
           normalizedTransactionId.includes(normalizedLocationId);
  });
  
  return matchingLocation || null;
};

export const calculateLocationCommissions = (
  transactions: Transaction[],
  assignments: Assignment[],
  locations: Location[]
): LocationCommission[] => {
  console.log('🚨 === GREENLIGHT COMMISSION CALCULATION DEBUG ===');
  console.log('📊 INPUT DATA:');
  console.log('- Transactions:', transactions.length);
  console.log('- Assignments:', assignments.length);
  console.log('- Locations:', locations.length);
  
  // Find Greenlight location specifically
  const greenlightLocation = locations.find(loc => 
    loc.name.toLowerCase().includes('greenlight')
  );
  
  if (greenlightLocation) {
    console.log('🎯 GREENLIGHT LOCATION FOUND:');
    console.log('- ID:', greenlightLocation.id);
    console.log('- Name:', greenlightLocation.name);
    console.log('- Account ID:', greenlightLocation.account_id);
    console.log('- Normalized Account ID:', normalizeAccountId(greenlightLocation.account_id));
  } else {
    console.log('❌ NO GREENLIGHT LOCATION FOUND');
  }
  
  // Check transaction account IDs
  const uniqueAccountIds = [...new Set(transactions.map(t => t.account_id))].filter(Boolean);
  console.log('📊 UNIQUE TRANSACTION ACCOUNT IDs:', uniqueAccountIds.length);
  uniqueAccountIds.slice(0, 10).forEach(id => {
    console.log(`- "${id}" (normalized: "${normalizeAccountId(id)}")`);
  });
  
  // Find Greenlight transactions
  const greenlightTransactions = transactions.filter(t => {
    if (!greenlightLocation || !t.account_id) return false;
    const matchingLocation = findMatchingLocation(t.account_id, [greenlightLocation]);
    return matchingLocation !== null;
  });
  
  console.log('🎯 GREENLIGHT TRANSACTIONS FOUND:', greenlightTransactions.length);
  if (greenlightTransactions.length > 0) {
    const totalGreenlightVolume = greenlightTransactions.reduce((sum, t) => {
      const bankVolume = Number(t.volume) || 0;
      const debitVolume = Number(t.debit_volume) || 0;
      return sum + bankVolume + debitVolume;
    }, 0);
    console.log('💰 TOTAL GREENLIGHT VOLUME:', totalGreenlightVolume.toLocaleString());
    
    // Show sample transactions
    greenlightTransactions.slice(0, 3).forEach((t, index) => {
      const bankVolume = Number(t.volume) || 0;
      const debitVolume = Number(t.debit_volume) || 0;
      console.log(`Sample ${index + 1}: Account "${t.account_id}", Bank: $${bankVolume}, Debit: $${debitVolume}, Date: ${t.transaction_date}`);
    });
  } else {
    console.log('❌ NO GREENLIGHT TRANSACTIONS FOUND');
    
    // Debug why no matches
    if (greenlightLocation) {
      const normalizedGreenlightId = normalizeAccountId(greenlightLocation.account_id);
      console.log('🔍 DEBUGGING ACCOUNT ID MATCHING:');
      console.log('- Looking for normalized:', normalizedGreenlightId);
      
      uniqueAccountIds.slice(0, 10).forEach(transId => {
        const normalizedTransId = normalizeAccountId(transId);
        console.log(`- Transaction "${transId}" (normalized: "${normalizedTransId}") - Match: ${normalizedTransId === normalizedGreenlightId}`);
      });
    }
  }

  // Filter out zero-volume transactions
  const nonZeroTransactions = transactions.filter(transaction => {
    const bankCardVolume = Number(transaction.volume) || 0;
    const debitCardVolume = Number(transaction.debit_volume) || 0;
    const totalVolume = bankCardVolume + debitCardVolume;
    return totalVolume > 0;
  });

  console.log(`📊 VOLUME FILTERING: ${transactions.length} total → ${nonZeroTransactions.length} with volume > 0`);

  // Group transactions by location using improved matching
  const locationData = nonZeroTransactions.reduce((acc, transaction) => {
    const accountId = transaction.account_id;
    if (!accountId) return acc;
    
    // Find matching location using our improved matching function
    const matchingLocation = findMatchingLocation(accountId, locations);
    
    if (!matchingLocation) {
      console.log(`⚠️ No location found for account ID: "${accountId}"`);
      return acc;
    }
    
    // Use the location's account_id as the key for consistency
    const locationKey = matchingLocation.account_id;
    
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
    if (matchingLocation.name.toLowerCase().includes('greenlight')) {
      console.log(`💰 GREENLIGHT TRANSACTION PROCESSED: Account "${accountId}" → Location "${matchingLocation.name}", Volume: $${totalTransactionVolume}, Running Total: $${acc[locationKey].totalVolume}`);
    }
    
    return acc;
  }, {} as Record<string, LocationData>);

  // VERIFY: Check Greenlight in final location data
  console.log('🎯 FINAL GREENLIGHT VERIFICATION:');
  if (greenlightLocation) {
    const locationInfo = locationData[greenlightLocation.account_id];
    if (locationInfo) {
      console.log(`✅ GREENLIGHT IN FINAL DATA: "${greenlightLocation.name}" - Volume: $${locationInfo.totalVolume.toLocaleString()}, Transactions: ${locationInfo.transactionCount}`);
    } else {
      console.log(`❌ GREENLIGHT MISSING FROM FINAL DATA: "${greenlightLocation.name}" (${greenlightLocation.account_id})`);
      
      // Check if any location data keys are similar
      const locationDataKeys = Object.keys(locationData);
      console.log('🔍 Available location data keys:', locationDataKeys);
      
      const normalizedGreenlightId = normalizeAccountId(greenlightLocation.account_id);
      const similarKeys = locationDataKeys.filter(key => {
        const normalizedKey = normalizeAccountId(key);
        return normalizedKey.includes(normalizedGreenlightId.slice(-6)) || 
               normalizedGreenlightId.includes(normalizedKey.slice(-6));
      });
      
      if (similarKeys.length > 0) {
        console.log(`🔍 Similar keys found:`, similarKeys);
        similarKeys.forEach(key => {
          console.log(`- Key "${key}" has volume: $${locationData[key].totalVolume.toLocaleString()}`);
        });
      }
    }
  }

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

  console.log('🚨 === GREENLIGHT COMMISSION CALCULATION DEBUG END ===');
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
