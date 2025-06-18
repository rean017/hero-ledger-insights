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
  // First check if transaction has a direct location_id (from new upload process)
  if (transaction.location_id) {
    const directMatch = locations.find(loc => loc.id === transaction.location_id);
    if (directMatch) {
      console.log(`✅ Direct location match found: ${directMatch.name} (ID: ${directMatch.id})`);
      return directMatch;
    }
  }

  // Fall back to account_id matching if no direct location_id
  const transactionAccountId = transaction.account_id;
  if (!transactionAccountId) {
    console.log(`⚠️ No account_id or location_id for transaction`);
    return null;
  }
  
  // First try exact match
  let matchingLocation = locations.find(loc => loc.account_id === transactionAccountId);
  if (matchingLocation) {
    console.log(`✅ Exact account_id match: ${matchingLocation.name} (${matchingLocation.account_id})`);
    return matchingLocation;
  }
  
  // Try normalized matching
  const normalizedTransactionId = normalizeAccountId(transactionAccountId);
  matchingLocation = locations.find(loc => {
    if (!loc.account_id) return false;
    const normalizedLocationId = normalizeAccountId(loc.account_id);
    return normalizedLocationId === normalizedTransactionId;
  });
  
  if (matchingLocation) {
    console.log(`✅ Normalized account_id match: ${matchingLocation.name}`);
    return matchingLocation;
  }
  
  // Try partial matching
  matchingLocation = locations.find(loc => {
    if (!loc.account_id) return false;
    const normalizedLocationId = normalizeAccountId(loc.account_id);
    return normalizedLocationId.includes(normalizedTransactionId) || 
           normalizedTransactionId.includes(normalizedLocationId);
  });
  
  if (matchingLocation) {
    console.log(`✅ Partial account_id match: ${matchingLocation.name}`);
    return matchingLocation;
  }

  console.log(`❌ No location found for account ID: "${transactionAccountId}"`);
  return null;
};

export const calculateLocationCommissions = (
  transactions: Transaction[],
  assignments: Assignment[],
  locations: Location[]
): LocationCommission[] => {
  console.log('🚨 === ENHANCED LOCATION CONSOLIDATION ===');
  console.log('📊 INPUT DATA:');
  console.log('- Transactions:', transactions.length);
  console.log('- Assignments:', assignments.length);
  console.log('- Locations:', locations.length);
  
  // Debug transaction data structure
  console.log('🔍 Sample transaction structure:', transactions.slice(0, 3).map(t => ({
    account_id: t.account_id,
    location_id: t.location_id,
    volume: t.volume,
    debit_volume: t.debit_volume,
    agent_payout: t.agent_payout
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
  console.log('🔍 DUPLICATE LOCATION ANALYSIS:');
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
    return totalVolume > 0;
  });

  console.log(`📊 VOLUME FILTERING: ${transactions.length} total → ${nonZeroTransactions.length} with volume > 0`);

  // Step 4: Group transactions by NORMALIZED location name using enhanced matching
  const locationDataByName = new Map<string, LocationData>();
  let matchedTransactions = 0;
  let unmatchedTransactions = 0;
  
  nonZeroTransactions.forEach(transaction => {
    // Use enhanced matching function
    const matchingLocation = findMatchingLocation(transaction, locations);
    
    if (!matchingLocation) {
      unmatchedTransactions++;
      console.log(`⚠️ No location found for transaction:`, {
        account_id: transaction.account_id,
        location_id: transaction.location_id,
        volume: transaction.volume
      });
      return;
    }
    
    matchedTransactions++;
    
    // Use NORMALIZED location name as the key to consolidate duplicates
    const normalizedLocationName = normalizeLocationName(matchingLocation.name);
    
    if (!locationDataByName.has(normalizedLocationName)) {
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
    
    console.log(`💰 MATCHED TRANSACTION: ${matchingLocation.name} → Volume: $${totalTransactionVolume}, Running Total: $${locationData.totalVolume}`);
  });

  console.log(`📊 MATCHING RESULTS: ${matchedTransactions} matched, ${unmatchedTransactions} unmatched`);

  const commissions: LocationCommission[] = [];

  // Step 5: Process assignments by location, using the primary location for each name group
  locationNameGroups.forEach((locationGroup, normalizedName) => {
    // Get the consolidated data for this location name
    const locationData = locationDataByName.get(normalizedName);
    if (!locationData || locationData.totalVolume === 0) {
      console.log(`⚠️ No transaction data for location group: ${normalizedName}`);
      return;
    }

    // Use the first location in the group as the primary (could be enhanced to pick the one with most assignments)
    const primaryLocation = locationGroup[0];
    
    // Get all assignments for ALL locations in this group (to handle duplicates properly)
    const allAssignments = assignments.filter(assignment => 
      assignment.is_active && locationGroup.some(loc => loc.id === assignment.location_id)
    );

    if (allAssignments.length === 0) {
      console.log(`⚠️ No assignments for location group: ${normalizedName}`);
      return;
    }

    console.log(`💼 Processing consolidated location: ${primaryLocation.name} with volume: $${locationData.totalVolume.toLocaleString()}`);

    // Calculate commissions using consolidated data
    const otherAgents = allAssignments.filter(a => a.agent_name !== 'Merchant Hero');
    const merchantHeroAssignment = allAssignments.find(a => a.agent_name === 'Merchant Hero');
    
    let totalCommissionsPaid = 0;
    
    // Calculate payouts for other agents
    otherAgents.forEach(assignment => {
      const bpsDecimal = assignment.commission_rate / 100;
      const agentPayout = locationData.totalVolume * bpsDecimal;
      totalCommissionsPaid += agentPayout;
      
      console.log(`💰 Agent calculation for ${assignment.agent_name}:`, {
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
      
      console.log(`💰 Merchant Hero calculation:`, {
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

  console.log('🚨 === ENHANCED LOCATION CONSOLIDATION END ===');
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
