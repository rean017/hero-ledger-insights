
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
  raw_data?: any;
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
  console.log(`🔍 COMMISSION CALC: Looking for location match for transaction:`, {
    account_id: transaction.account_id,
    location_id: transaction.location_id,
    agent_payout: transaction.agent_payout,
    raw_data_sample: transaction.raw_data ? Object.keys(transaction.raw_data).slice(0, 5) : 'none'
  });

  // PRIORITY 1: Direct location_id match (from new Maverick uploads)
  if (transaction.location_id && transaction.location_id !== 'undefined') {
    const directMatch = locations.find(loc => loc.id === transaction.location_id);
    if (directMatch) {
      console.log(`✅ COMMISSION CALC: Direct location_id match found: ${directMatch.name}`);
      return directMatch;
    }
  }

  // PRIORITY 2: Exact account_id match (if account_id exists and is not null)
  if (transaction.account_id && transaction.account_id !== null && transaction.account_id !== 'null') {
    const exactMatch = locations.find(loc => loc.account_id === transaction.account_id);
    if (exactMatch) {
      console.log(`✅ COMMISSION CALC: Exact account_id match: ${exactMatch.name}`);
      return exactMatch;
    }
  }

  // PRIORITY 3: Try to extract location info from raw_data
  if (transaction.raw_data) {
    const rawData = transaction.raw_data;
    console.log(`🔍 COMMISSION CALC: Checking raw_data for location clues:`, rawData);
    
    // Check various common field names in raw data
    const possibleLocationFields = [
      'location_id', 'locationId', 'location', 'store_id', 'storeId', 'store',
      'merchant_id', 'merchantId', 'merchant', 'business_id', 'businessId',
      'account_id', 'accountId', 'account', 'mid', 'MID'
    ];
    
    for (const field of possibleLocationFields) {
      if (rawData[field] && rawData[field] !== null && rawData[field] !== '') {
        // Try to match by this field value against location account_ids or names
        const fieldValue = String(rawData[field]).trim();
        console.log(`🔍 COMMISSION CALC: Trying to match field '${field}' with value '${fieldValue}'`);
        
        const locationMatch = locations.find(loc => 
          loc.account_id === fieldValue || 
          loc.name.toLowerCase().includes(fieldValue.toLowerCase()) ||
          loc.id === fieldValue
        );
        
        if (locationMatch) {
          console.log(`✅ COMMISSION CALC: Found match via raw_data field '${field}': ${locationMatch.name}`);
          return locationMatch;
        }
      }
    }
    
    // Check if there's any text field that might contain location name
    const possibleNameFields = ['merchant_name', 'merchantName', 'business_name', 'businessName', 'name'];
    for (const field of possibleNameFields) {
      if (rawData[field] && typeof rawData[field] === 'string') {
        const nameValue = rawData[field].toLowerCase().trim();
        const locationMatch = locations.find(loc => 
          loc.name.toLowerCase().includes(nameValue) || 
          nameValue.includes(loc.name.toLowerCase())
        );
        if (locationMatch) {
          console.log(`✅ COMMISSION CALC: Found match via name field '${field}': ${locationMatch.name}`);
          return locationMatch;
        }
      }
    }
  }

  console.log(`❌ COMMISSION CALC: No match found for transaction`);
  return null;
};

export const calculateLocationCommissions = (
  transactions: Transaction[],
  assignments: Assignment[],
  locations: Location[]
): LocationCommission[] => {
  console.log('🚨 === COMMISSION CALC DEBUG SESSION ===');
  console.log('📊 COMMISSION CALC INPUT DATA:');
  console.log('- Transactions:', transactions.length);
  console.log('- Assignments:', assignments.length);  
  console.log('- Locations:', locations.length);

  // Log sample transaction for debugging
  if (transactions.length > 0) {
    console.log('📊 COMMISSION CALC: Sample transaction structure:', {
      ...transactions[0],
      raw_data: transactions[0].raw_data ? 'Present' : 'Missing'
    });
  }

  // Group transactions by location
  const locationMap = new Map<string, LocationData>();
  const unMatchedTransactions: Transaction[] = [];

  // First, try to match transactions to specific locations
  transactions.forEach((transaction, index) => {
    const agentPayout = Number(transaction.agent_payout) || 0;
    
    // Skip transactions with no payout
    if (agentPayout === 0) return;
    
    const matchedLocation = findMatchingLocation(transaction, locations);
    
    if (matchedLocation) {
      const locationId = matchedLocation.id;
      
      if (!locationMap.has(locationId)) {
        locationMap.set(locationId, {
          totalVolume: 0,
          totalAgentPayout: 0,
          transactionCount: 0,
          accountIds: new Set()
        });
      }
      
      const locationData = locationMap.get(locationId)!;
      const creditVolume = Number(transaction.volume) || 0;
      const debitVolume = Number(transaction.debit_volume) || 0;
      
      locationData.totalVolume += creditVolume + debitVolume;
      locationData.totalAgentPayout += agentPayout;
      locationData.transactionCount += 1;
      
      if (transaction.account_id) {
        locationData.accountIds.add(transaction.account_id);
      }
      
      console.log(`💰 COMMISSION CALC: Added transaction ${index + 1} to ${matchedLocation.name}: $${agentPayout.toLocaleString()} payout`);
    } else {
      unMatchedTransactions.push(transaction);
    }
  });

  console.log(`📊 COMMISSION CALC: Matched ${transactions.length - unMatchedTransactions.length} transactions to locations`);
  console.log(`⚠️ COMMISSION CALC: ${unMatchedTransactions.length} transactions could not be matched to locations`);

  // If we have lots of unmatched transactions, DON'T distribute them - this likely means a data issue
  if (unMatchedTransactions.length > transactions.length * 0.8) {
    console.log(`🚨 COMMISSION CALC: Over 80% of transactions are unmatched - likely a data issue. Not distributing unmatched payouts.`);
    console.log(`🚨 COMMISSION CALC: Please check transaction data structure and location matching logic.`);
  } else if (unMatchedTransactions.length > 0) {
    // Only distribute if we have some successful matches
    const locationsWithAssignments = locations.filter(loc => 
      assignments?.some(a => a.location_id === loc.id && a.is_active)
    );

    if (locationsWithAssignments.length > 0) {
      const totalUnmatchedPayouts = unMatchedTransactions.reduce((sum, t) => {
        return sum + (Number(t.agent_payout) || 0);
      }, 0);

      const payoutPerLocation = totalUnmatchedPayouts / locationsWithAssignments.length;

      console.log(`📊 COMMISSION CALC: Distributing ${totalUnmatchedPayouts.toLocaleString()} unmatched payouts`);
      console.log(`📊 COMMISSION CALC: ${payoutPerLocation.toLocaleString()} payout per location`);

      locationsWithAssignments.forEach(location => {
        if (!locationMap.has(location.id)) {
          locationMap.set(location.id, {
            totalVolume: 0,
            totalAgentPayout: 0,
            transactionCount: 0,
            accountIds: new Set()
          });
        }
        
        const locationData = locationMap.get(location.id)!;
        locationData.totalAgentPayout += payoutPerLocation;
        // Since we don't have volume data, we'll calculate it based on typical commission rates
        // Assuming roughly 0.5% commission rate to estimate volume
        const estimatedVolume = payoutPerLocation / 0.005;
        locationData.totalVolume += estimatedVolume;
      });
    }
  }

  const commissions: LocationCommission[] = [];

  // Process each location that has data
  locationMap.forEach((locationData, locationId) => {
    const location = locations.find(l => l.id === locationId);
    if (!location) return;

    const locationAssignments = assignments.filter(a => a.location_id === locationId && a.is_active);
    
    console.log(`💼 COMMISSION CALC: Processing location: ${location.name} with $${locationData.totalAgentPayout.toLocaleString()} total payout`);

    const otherAgents = locationAssignments.filter(a => a.agent_name !== 'Merchant Hero');
    const merchantHeroAssignment = locationAssignments.find(a => a.agent_name === 'Merchant Hero');
    
    let totalCommissionsPaid = 0;
    
    // Calculate payouts for other agents based on their commission rates
    otherAgents.forEach(assignment => {
      const bpsDecimal = assignment.commission_rate / 100;
      
      // If we have volume, calculate based on volume; otherwise use proportional payout
      let agentPayout = 0;
      if (locationData.totalVolume > 0) {
        agentPayout = locationData.totalVolume * bpsDecimal;
      } else {
        // If no volume, distribute the total payout proportionally based on commission rates
        const totalBPS = locationAssignments.reduce((sum, a) => sum + (a.commission_rate / 100), 0);
        if (totalBPS > 0) {
          agentPayout = locationData.totalAgentPayout * (bpsDecimal / totalBPS);
        }
      }
      
      totalCommissionsPaid += agentPayout;
      
      console.log(`💰 COMMISSION CALC: ${assignment.agent_name} → ${Math.round(assignment.commission_rate * 100)} BPS → $${agentPayout.toLocaleString()}`);

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

    // Calculate Merchant Hero's earnings (remainder)
    if (merchantHeroAssignment) {
      const merchantHeroPayout = Math.max(0, locationData.totalAgentPayout - totalCommissionsPaid);
      const merchantHeroBPS = locationData.totalVolume > 0 
        ? Math.round((merchantHeroPayout / locationData.totalVolume) * 10000)
        : 0;
      
      console.log(`💰 COMMISSION CALC: Merchant Hero → Auto-calc ${merchantHeroBPS} BPS → $${merchantHeroPayout.toLocaleString()}`);

      commissions.push({
        locationId: location.id,
        locationName: location.name,
        agentName: merchantHeroAssignment.agent_name,
        bpsRate: merchantHeroBPS,
        decimalRate: locationData.totalVolume > 0 ? merchantHeroPayout / locationData.totalVolume : 0,
        locationVolume: locationData.totalVolume,
        netAgentPayout: locationData.totalAgentPayout,
        agentPayout: 0,
        merchantHeroPayout
      });
    }
  });

  console.log('🚨 === COMMISSION CALC DEBUG END ===');
  console.log(`🎉 COMMISSION CALC: Generated ${commissions.length} commission records`);
  
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
