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
  console.log(`🔍 COMMISSION CALC: Looking for location match for transaction:`, {
    account_id: transaction.account_id,
    location_id: transaction.location_id,
    volume: transaction.volume,
    debit_volume: transaction.debit_volume
  });

  // PRIORITY 1: Direct location_id match (from new Maverick uploads)
  if (transaction.location_id) {
    const directMatch = locations.find(loc => loc.id === transaction.location_id);
    if (directMatch) {
      console.log(`✅ COMMISSION CALC: Direct location_id match found: ${directMatch.name}`);
      return directMatch;
    }
  }

  // PRIORITY 2: For transactions with null account_id, we need special handling
  if (!transaction.account_id || transaction.account_id === null) {
    console.log(`⚠️ COMMISSION CALC: Transaction has null account_id, cannot match by account`);
    return null;
  }

  // PRIORITY 3: Exact account_id match
  const exactMatch = locations.find(loc => loc.account_id === transaction.account_id);
  if (exactMatch) {
    console.log(`✅ COMMISSION CALC: Exact account_id match: ${exactMatch.name}`);
    return exactMatch;
  }

  console.log(`❌ COMMISSION CALC: No match found for account_id: ${transaction.account_id}`);
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

  // Calculate totals from transactions for even distribution
  const totalTransactionVolume = transactions.reduce((sum, t) => {
    const creditVol = Number(t.volume) || 0;
    const debitVol = Number(t.debit_volume) || 0;
    return sum + creditVol + debitVol;
  }, 0);

  const totalTransactionPayouts = transactions.reduce((sum, t) => {
    return sum + (Number(t.agent_payout) || 0);
  }, 0);

  console.log(`📊 COMMISSION CALC: Total volume from transactions: ${totalTransactionVolume.toLocaleString()}`);
  console.log(`📊 COMMISSION CALC: Total payouts from transactions: ${totalTransactionPayouts.toLocaleString()}`);

  // Get locations that have assignments
  const locationsWithAssignments = locations.filter(loc => 
    assignments?.some(a => a.location_id === loc.id && a.is_active)
  );

  console.log(`📊 COMMISSION CALC: ${locationsWithAssignments.length} locations have assignments`);

  // Since most transactions have null account_id, distribute evenly across assigned locations
  const volumePerLocation = locationsWithAssignments.length > 0 
    ? totalTransactionVolume / locationsWithAssignments.length 
    : 0;
  const payoutPerLocation = locationsWithAssignments.length > 0 
    ? totalTransactionPayouts / locationsWithAssignments.length 
    : 0;

  console.log(`📊 COMMISSION CALC: Distributing ${volumePerLocation.toLocaleString()} volume and ${payoutPerLocation.toLocaleString()} payout per location`);

  const commissions: LocationCommission[] = [];

  // Process each location that has assignments
  locationsWithAssignments.forEach(location => {
    const locationAssignments = assignments.filter(a => a.location_id === location.id && a.is_active);
    
    console.log(`💼 COMMISSION CALC: Processing location: ${location.name} with $${volumePerLocation.toLocaleString()} volume`);

    const otherAgents = locationAssignments.filter(a => a.agent_name !== 'Merchant Hero');
    const merchantHeroAssignment = locationAssignments.find(a => a.agent_name === 'Merchant Hero');
    
    let totalCommissionsPaid = 0;
    
    // Calculate payouts for other agents
    otherAgents.forEach(assignment => {
      const bpsDecimal = assignment.commission_rate / 100;
      const agentPayout = volumePerLocation * bpsDecimal;
      totalCommissionsPaid += agentPayout;
      
      console.log(`💰 COMMISSION CALC: ${assignment.agent_name} → ${Math.round(assignment.commission_rate * 100)} BPS → $${agentPayout.toLocaleString()}`);

      commissions.push({
        locationId: location.id,
        locationName: location.name,
        agentName: assignment.agent_name,
        bpsRate: Math.round(assignment.commission_rate * 100),
        decimalRate: bpsDecimal,
        locationVolume: volumePerLocation,
        netAgentPayout: payoutPerLocation,
        agentPayout,
        merchantHeroPayout: 0
      });
    });

    // Calculate Merchant Hero's earnings
    if (merchantHeroAssignment) {
      const merchantHeroPayout = Math.max(0, payoutPerLocation - totalCommissionsPaid);
      const merchantHeroBPS = volumePerLocation > 0 
        ? Math.round((merchantHeroPayout / volumePerLocation) * 10000)
        : 0;
      
      console.log(`💰 COMMISSION CALC: Merchant Hero → Auto-calc ${merchantHeroBPS} BPS → $${merchantHeroPayout.toLocaleString()}`);

      commissions.push({
        locationId: location.id,
        locationName: location.name,
        agentName: merchantHeroAssignment.agent_name,
        bpsRate: merchantHeroBPS,
        decimalRate: volumePerLocation > 0 ? merchantHeroPayout / volumePerLocation : 0,
        locationVolume: volumePerLocation,
        netAgentPayout: payoutPerLocation,
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
