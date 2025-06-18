
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
  accountIds: Set<string>; // Track all account IDs for this location
}

interface Transaction {
  account_id: string;
  volume: number;
  debit_volume: number;
  agent_payout: number;
  transaction_date?: string;
  location_id?: string; // Add this field for direct location matching
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
  return accountId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
};

// Helper function to normalize location names for duplicate detection
const normalizeLocationName = (name: string): string => {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
};

// Enhanced function to find matching location for a transaction
const findMatchingLocation = (transaction: Transaction, locations: Location[]): Location | null => {
  console.log(`🔍 VOLUME DEBUG: Looking for location match for transaction:`, {
    account_id: transaction.account_id,
    location_id: transaction.location_id,
    volume: transaction.volume,
    debit_volume: transaction.debit_volume
  });

  // First check if transaction has a direct location_id (from new upload process)
  if (transaction.location_id) {
    const directMatch = locations.find(loc => loc.id === transaction.location_id);
    if (directMatch) {
      console.log(`✅ VOLUME DEBUG: Direct location match found: ${directMatch.name} (ID: ${directMatch.id})`);
      return directMatch;
    } else {
      console.log(`❌ VOLUME DEBUG: No direct location match for location_id: ${transaction.location_id}`);
    }
  }

  // Fall back to account_id matching if no direct location_id
  const transactionAccountId = transaction.account_id;
  if (!transactionAccountId) {
    console.log(`⚠️ VOLUME DEBUG: No account_id or location_id for transaction - SKIPPING`);
    return null;
  }
  
  console.log(`🔍 VOLUME DEBUG: Searching for account_id match: "${transactionAccountId}"`);
  console.log(`📋 VOLUME DEBUG: Available locations:`, locations.map(l => ({
    id: l.id,
    name: l.name,
    account_id: l.account_id
  })));
  
  // First try exact match
  let matchingLocation = locations.find(loc => loc.account_id === transactionAccountId);
  if (matchingLocation) {
    console.log(`✅ VOLUME DEBUG: Exact account_id match: ${matchingLocation.name} (${matchingLocation.account_id})`);
    return matchingLocation;
  }
  
  // Try normalized matching
  const normalizedTransactionId = normalizeAccountId(transactionAccountId);
  console.log(`🔄 VOLUME DEBUG: Trying normalized matching for: "${normalizedTransactionId}"`);
  
  matchingLocation = locations.find(loc => {
    if (!loc.account_id) return false;
    const normalizedLocationId = normalizeAccountId(loc.account_id);
    const matches = normalizedLocationId === normalizedTransactionId;
    if (matches) {
      console.log(`✅ VOLUME DEBUG: Normalized match found: ${loc.name} (${loc.account_id} -> ${normalizedLocationId})`);
    }
    return matches;
  });
  
  if (matchingLocation) {
    return matchingLocation;
  }
  
  // Try partial matching
  console.log(`🔄 VOLUME DEBUG: Trying partial matching...`);
  matchingLocation = locations.find(loc => {
    if (!loc.account_id) return false;
    const normalizedLocationId = normalizeAccountId(loc.account_id);
    const partialMatch = normalizedLocationId.includes(normalizedTransactionId) || 
           normalizedTransactionId.includes(normalizedLocationId);
    if (partialMatch) {
      console.log(`✅ VOLUME DEBUG: Partial match found: ${loc.name} (${loc.account_id} -> ${normalizedLocationId})`);
    }
    return partialMatch;
  });
  
  if (matchingLocation) {
    return matchingLocation;
  }

  console.log(`❌ VOLUME DEBUG: NO LOCATION FOUND for account ID: "${transactionAccountId}"`);
  return null;
};

export const calculateLocationCommissions = (
  transactions: Transaction[],
  assignments: Assignment[],
  locations: Location[]
): LocationCommission[] => {
  console.log('🚨 === VOLUME DEBUG SESSION ===');
  console.log('📊 VOLUME DEBUG INPUT DATA:');
  console.log('- Transactions:', transactions.length);
  console.log('- Assignments:', assignments.length);
  console.log('- Locations:', locations.length);
  
  // Debug transaction data structure
  console.log('🔍 VOLUME DEBUG: First 5 transactions:', transactions.slice(0, 5).map(t => ({
    account_id: t.account_id,
    location_id: t.location_id,
    volume: t.volume,
    debit_volume: t.debit_volume,
    agent_payout: t.agent_payout,
    transaction_date: t.transaction_date
  })));

  console.log('🔍 VOLUME DEBUG: First 5 locations:', locations.slice(0, 5).map(l => ({
    id: l.id,
    name: l.name,
    account_id: l.account_id
  })));

  // Step 1: Group locations by normalized name to identify duplicates
  const locationNameGroups = new Map<string, Location[]>();
  locations.forEach(location => {
    const normalizedName = normalizeLocationName(location.name);
    if (!locationNameGroups.has(normalizedName)) {
      locationNameGroups.set(normalizedName, []);
    }
    locationNameGroups.get(normalizedName)!.push(location);
  });

  // Step 2: Find and log duplicate location groups
  console.log('🔍 VOLUME DEBUG: DUPLICATE LOCATION ANALYSIS:');
  locationNameGroups.forEach((locationGroup, normalizedName) => {
    if (locationGroup.length > 1) {
      console.log(`🔄 Found ${locationGroup.length} locations with name "${normalizedName}":`, 
        locationGroup.map(loc => `"${loc.name}" (ID: ${loc.id}, Account: ${loc.account_id})`));
    }
  });

  // Step 3: Filter out zero-volume transactions
  const nonZeroTransactions = transactions.filter(transaction => {
    const bankCardVolume = Number(transaction.volume) || 0;
    const debitCardVolume = Number(transaction.debit_volume) || 0;
    const totalVolume = bankCardVolume + debitCardVolume;
    const hasVolume = totalVolume > 0;
    
    if (!hasVolume) {
      console.log(`⚠️ VOLUME DEBUG: Filtering out zero-volume transaction:`, {
        account_id: transaction.account_id,
        volume: transaction.volume,
        debit_volume: transaction.debit_volume,
        totalVolume
      });
    }
    
    return hasVolume;
  });

  console.log(`📊 VOLUME DEBUG: VOLUME FILTERING: ${transactions.length} total → ${nonZeroTransactions.length} with volume > 0`);

  // Step 4: Group transactions by NORMALIZED location name using enhanced matching
  const locationDataByName = new Map<string, LocationData>();
  let matchedTransactions = 0;
  let unmatchedTransactions = 0;
  
  nonZeroTransactions.forEach((transaction, index) => {
    console.log(`\n🔍 VOLUME DEBUG: Processing transaction ${index + 1}/${nonZeroTransactions.length}`);
    
    // Use enhanced matching function
    const matchingLocation = findMatchingLocation(transaction, locations);
    
    if (!matchingLocation) {
      unmatchedTransactions++;
      console.log(`❌ VOLUME DEBUG: No location found for transaction:`, {
        account_id: transaction.account_id,
        location_id: transaction.location_id,
        volume: transaction.volume,
        debit_volume: transaction.debit_volume
      });
      return;
    }
    
    matchedTransactions++;
    
    // Use NORMALIZED location name as the key to consolidate duplicates
    const normalizedLocationName = normalizeLocationName(matchingLocation.name);
    
    if (!locationDataByName.has(normalizedLocationName)) {
      console.log(`🆕 VOLUME DEBUG: Creating new location data entry for: ${normalizedLocationName}`);
      locationDataByName.set(normalizedLocationName, {
        totalVolume: 0,
        totalAgentPayout: 0,
        bankCardTotal: 0,
        debitCardTotal: 0,
        transactionCount: 0,
        accountIds: new Set()
      });
    }
    
    const locationData = locationDataByName.get(normalizedLocationName)!;
    
    const bankCardVolume = Number(transaction.volume) || 0;
    const debitCardVolume = Number(transaction.debit_volume) || 0;
    const totalTransactionVolume = bankCardVolume + debitCardVolume;
    
    locationData.totalVolume += totalTransactionVolume;
    locationData.bankCardTotal += bankCardVolume;
    locationData.debitCardTotal += debitCardVolume;
    locationData.transactionCount += 1;
    if (transaction.account_id) {
      locationData.accountIds.add(transaction.account_id);
    }
    
    const agentPayout = Number(transaction.agent_payout) || 0;
    locationData.totalAgentPayout += agentPayout;
    
    console.log(`💰 VOLUME DEBUG: MATCHED TRANSACTION: ${matchingLocation.name} → Volume: $${totalTransactionVolume}, Running Total: $${locationData.totalVolume}`);
  });

  console.log(`\n📊 VOLUME DEBUG: FINAL MATCHING RESULTS: ${matchedTransactions} matched, ${unmatchedTransactions} unmatched`);
  console.log(`📊 VOLUME DEBUG: Location data summary:`, Array.from(locationDataByName.entries()).map(([name, data]) => ({
    name,
    totalVolume: data.totalVolume,
    transactionCount: data.transactionCount
  })));

  const commissions: LocationCommission[] = [];

  // Step 5: Process assignments by location, using the primary location for each name group
  locationNameGroups.forEach((locationGroup, normalizedName) => {
    // Get the consolidated data for this location name
    const locationData = locationDataByName.get(normalizedName);
    if (!locationData || locationData.totalVolume === 0) {
      console.log(`⚠️ VOLUME DEBUG: No transaction data for location group: ${normalizedName}`);
      return;
    }

    // Use the first location in the group as the primary (could be enhanced to pick the one with most assignments)
    const primaryLocation = locationGroup[0];
    
    // Get all assignments for ALL locations in this group (to handle duplicates properly)
    const allAssignments = assignments.filter(assignment => 
      assignment.is_active && locationGroup.some(loc => loc.id === assignment.location_id)
    );

    if (allAssignments.length === 0) {
      console.log(`⚠️ VOLUME DEBUG: No assignments for location group: ${normalizedName}`);
      return;
    }

    console.log(`💼 VOLUME DEBUG: Processing consolidated location: ${primaryLocation.name} with volume: $${locationData.totalVolume.toLocaleString()}`);

    // Calculate commissions using consolidated data
    const otherAgents = allAssignments.filter(a => a.agent_name !== 'Merchant Hero');
    const merchantHeroAssignment = allAssignments.find(a => a.agent_name === 'Merchant Hero');
    
    let totalCommissionsPaid = 0;
    
    // Calculate payouts for other agents
    otherAgents.forEach(assignment => {
      const bpsDecimal = assignment.commission_rate / 100;
      const agentPayout = locationData.totalVolume * bpsDecimal;
      totalCommissionsPaid += agentPayout;
      
      console.log(`💰 VOLUME DEBUG: Agent calculation for ${assignment.agent_name}:`, {
        locationName: primaryLocation.name,
        totalVolume: locationData.totalVolume,
        bpsRate: Math.round(assignment.commission_rate * 100),
        agentPayout: agentPayout
      });

      commissions.push({
        locationId: primaryLocation.id, // Use primary location ID
        locationName: primaryLocation.name,
        agentName: assignment.agent_name,
        bpsRate: Math.round(assignment.commission_rate * 100),
        decimalRate: bpsDecimal,
        locationVolume: locationData.totalVolume,
        netAgentPayout: locationData.totalAgentPayout,
        agentPayout,
        merchantHeroPayout: 0
      });
    });

    // Calculate Merchant Hero's earnings
    if (merchantHeroAssignment) {
      const merchantHeroPayout = Math.max(0, locationData.totalAgentPayout - totalCommissionsPaid);
      const merchantHeroBPS = locationData.totalVolume > 0 
        ? Math.round((merchantHeroPayout / locationData.totalVolume) * 10000)
        : 0;
      
      console.log(`💰 VOLUME DEBUG: Merchant Hero calculation:`, {
        locationName: primaryLocation.name,
        netAgentPayout: locationData.totalAgentPayout,
        totalCommissionsPaid,
        merchantHeroPayout,
        autoCalculatedBPS: merchantHeroBPS
      });

      commissions.push({
        locationId: primaryLocation.id, // Use primary location ID
        locationName: primaryLocation.name,
        agentName: merchantHeroAssignment.agent_name,
        bpsRate: merchantHeroBPS,
        decimalRate: merchantHeroPayout / locationData.totalVolume,
        locationVolume: locationData.totalVolume,
        netAgentPayout: locationData.totalAgentPayout,
        agentPayout: 0,
        merchantHeroPayout
      });
    }
  });

  console.log('🚨 === VOLUME DEBUG SESSION END ===');
  console.log(`🎉 VOLUME DEBUG: Total commissions calculated: ${commissions.length}`);
  
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
