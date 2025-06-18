
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
  accountIds: Set<string>;
}

interface Transaction {
  account_id: string;
  volume: number;
  debit_volume: number;
  agent_payout: number;
  transaction_date?: string;
  location_id?: string;
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

// Enhanced function to find matching location for a transaction
const findMatchingLocation = (transaction: Transaction, locations: Location[]): Location | null => {
  console.log(`🔍 MAVERICK MATCH: Looking for location match for transaction:`, {
    account_id: transaction.account_id,
    location_id: transaction.location_id,
    volume: transaction.volume,
    debit_volume: transaction.debit_volume
  });

  // PRIORITY 1: Direct location_id match (from new Maverick uploads)
  if (transaction.location_id) {
    const directMatch = locations.find(loc => loc.id === transaction.location_id);
    if (directMatch) {
      console.log(`✅ MAVERICK MATCH: Direct location_id match found: ${directMatch.name}`);
      return directMatch;
    }
  }

  // PRIORITY 2: For transactions with null account_id, we need special handling
  if (!transaction.account_id || transaction.account_id === null) {
    console.log(`⚠️ MAVERICK MATCH: Transaction has null account_id, cannot match by account`);
    return null;
  }

  // PRIORITY 3: Exact account_id match
  const exactMatch = locations.find(loc => loc.account_id === transaction.account_id);
  if (exactMatch) {
    console.log(`✅ MAVERICK MATCH: Exact account_id match: ${exactMatch.name}`);
    return exactMatch;
  }

  console.log(`❌ MAVERICK MATCH: No match found for account_id: ${transaction.account_id}`);
  return null;
};

export const calculateLocationCommissions = (
  transactions: Transaction[],
  assignments: Assignment[],
  locations: Location[]
): LocationCommission[] => {
  console.log('🚨 === MAVERICK DEBUG SESSION ===');
  console.log('📊 MAVERICK INPUT DATA:');
  console.log('- Transactions:', transactions.length);
  console.log('- Assignments:', assignments.length);  
  console.log('- Locations:', locations.length);

  // Debug: Show sample transactions
  console.log('🔍 MAVERICK: Sample transactions:', transactions.slice(0, 5).map(t => ({
    account_id: t.account_id,
    location_id: t.location_id,
    volume: t.volume,
    debit_volume: t.debit_volume,
    agent_payout: t.agent_payout
  })));

  console.log('🔍 MAVERICK: Sample locations:', locations.slice(0, 5).map(l => ({
    id: l.id,
    name: l.name,
    account_id: l.account_id
  })));

  // Filter out zero-volume transactions
  const nonZeroTransactions = transactions.filter(transaction => {
    const bankCardVolume = Number(transaction.volume) || 0;
    const debitCardVolume = Number(transaction.debit_volume) || 0;
    const totalVolume = bankCardVolume + debitCardVolume;
    return totalVolume > 0;
  });

  console.log(`📊 MAVERICK: Filtered ${transactions.length} → ${nonZeroTransactions.length} non-zero volume transactions`);

  // Group transactions by location
  const locationDataMap = new Map<string, LocationData>();
  let matchedCount = 0;
  let unmatchedCount = 0;

  nonZeroTransactions.forEach((transaction, index) => {
    console.log(`\n🔍 MAVERICK: Processing transaction ${index + 1}/${nonZeroTransactions.length}`);
    
    const matchingLocation = findMatchingLocation(transaction, locations);
    
    if (!matchingLocation) {
      unmatchedCount++;
      console.log(`❌ MAVERICK: UNMATCHED transaction:`, {
        account_id: transaction.account_id,
        location_id: transaction.location_id,
        volume: transaction.volume
      });
      return;
    }

    matchedCount++;
    const locationId = matchingLocation.id;

    if (!locationDataMap.has(locationId)) {
      locationDataMap.set(locationId, {
        totalVolume: 0,
        totalAgentPayout: 0,
        bankCardTotal: 0,
        debitCardTotal: 0,
        transactionCount: 0,
        accountIds: new Set()
      });
    }

    const locationData = locationDataMap.get(locationId)!;
    
    const bankCardVolume = Number(transaction.volume) || 0;
    const debitCardVolume = Number(transaction.debit_volume) || 0;
    const totalTransactionVolume = bankCardVolume + debitCardVolume;
    const agentPayout = Number(transaction.agent_payout) || 0;

    locationData.totalVolume += totalTransactionVolume;
    locationData.bankCardTotal += bankCardVolume;
    locationData.debitCardTotal += debitCardVolume;
    locationData.totalAgentPayout += agentPayout;
    locationData.transactionCount += 1;
    
    if (transaction.account_id) {
      locationData.accountIds.add(transaction.account_id);
    }

    console.log(`💰 MAVERICK: MATCHED ${matchingLocation.name} → Volume: $${totalTransactionVolume.toLocaleString()}, Running Total: $${locationData.totalVolume.toLocaleString()}`);
  });

  console.log(`\n📊 MAVERICK RESULTS: ${matchedCount} matched, ${unmatchedCount} unmatched transactions`);
  console.log(`📊 MAVERICK: Location data:`, Array.from(locationDataMap.entries()).map(([id, data]) => {
    const location = locations.find(l => l.id === id);
    return {
      locationName: location?.name || 'Unknown',
      totalVolume: data.totalVolume,
      transactionCount: data.transactionCount
    };
  }));

  const commissions: LocationCommission[] = [];

  // Process each location that has data
  locationDataMap.forEach((locationData, locationId) => {
    const location = locations.find(l => l.id === locationId);
    if (!location) {
      console.log(`⚠️ MAVERICK: Location not found for ID: ${locationId}`);
      return;
    }

    const locationAssignments = assignments.filter(a => a.location_id === locationId && a.is_active);
    
    if (locationAssignments.length === 0) {
      console.log(`⚠️ MAVERICK: No assignments for location: ${location.name}`);
      return;
    }

    console.log(`💼 MAVERICK: Processing location: ${location.name} with $${locationData.totalVolume.toLocaleString()} volume`);

    const otherAgents = locationAssignments.filter(a => a.agent_name !== 'Merchant Hero');
    const merchantHeroAssignment = locationAssignments.find(a => a.agent_name === 'Merchant Hero');
    
    let totalCommissionsPaid = 0;
    
    // Calculate payouts for other agents
    otherAgents.forEach(assignment => {
      const bpsDecimal = assignment.commission_rate / 100;
      const agentPayout = locationData.totalVolume * bpsDecimal;
      totalCommissionsPaid += agentPayout;
      
      console.log(`💰 MAVERICK: ${assignment.agent_name} → ${Math.round(assignment.commission_rate * 100)} BPS → $${agentPayout.toLocaleString()}`);

      commissions.push({
        locationId: location.id,
        locationName: location.name,
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
      
      console.log(`💰 MAVERICK: Merchant Hero → Auto-calc ${merchantHeroBPS} BPS → $${merchantHeroPayout.toLocaleString()}`);

      commissions.push({
        locationId: location.id,
        locationName: location.name,
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

  console.log('🚨 === MAVERICK DEBUG END ===');
  console.log(`🎉 MAVERICK: Generated ${commissions.length} commission records`);
  
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
