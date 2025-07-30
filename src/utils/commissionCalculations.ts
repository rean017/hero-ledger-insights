
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
}

interface Transaction {
  account_id: string;
  volume: number;
  debit_volume: number;
  agent_payout: number;
  transaction_date?: string;
  location_id?: string;
  processor?: string;
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

// Simplified function to find matching location for a transaction
const findMatchingLocation = (transaction: Transaction, locations: Location[]): Location | null => {
  console.log(`🎯 SIMPLIFIED MATCHING: Looking for location match for transaction:`, {
    account_id: transaction.account_id,
    location_id: transaction.location_id,
    agent_payout: transaction.agent_payout
  });

  // PRIORITY 1: Direct location_id match (most reliable)
  if (transaction.location_id) {
    const directMatch = locations.find(loc => loc.id === transaction.location_id);
    if (directMatch) {
      console.log(`✅ SIMPLIFIED MATCHING: Direct location_id match found: ${directMatch.name}`);
      return directMatch;
    }
  }

  // PRIORITY 2: Account_id match (DBA name used as account_id)
  if (transaction.account_id) {
    const accountMatch = locations.find(loc => 
      loc.account_id === transaction.account_id || 
      loc.name === transaction.account_id
    );
    if (accountMatch) {
      console.log(`✅ SIMPLIFIED MATCHING: Account/DBA match found: ${accountMatch.name}`);
      return accountMatch;
    }
  }

  console.log(`❌ SIMPLIFIED MATCHING: No match found for transaction`);
  return null;
};

export const calculateLocationCommissions = (
  transactions: Transaction[],
  assignments: Assignment[],
  locations: Location[]
): LocationCommission[] => {
  console.log('🎯 === COMMISSION CALC WITH REALISTIC VOLUME LOGIC ===');
  console.log('📊 INPUT DATA:');
  console.log('- Transactions:', transactions.length);
  console.log('- Assignments:', assignments.length);  
  console.log('- Locations:', locations.length);

  // Log sample transaction for debugging
  if (transactions.length > 0) {
    console.log('📊 Sample transaction:', transactions[0]);
  }

  // Group transactions by location
  const locationMap = new Map<string, LocationData>();
  let totalUnmatchedPayout = 0;
  let unmatchedCount = 0;

  // First pass: match transactions to specific locations
  transactions.forEach((transaction, index) => {
    const agentPayout = Number(transaction.agent_payout) || 0;
    const recordedVolume = Number(transaction.volume) || 0;
    const recordedDebitVolume = Number(transaction.debit_volume) || 0;
    
    // For TRNXN uploads, volume already contains the combined bankcard + debit volume (stored as volume, debit_volume is 0)
    // For other processors, we need to add volume + debit_volume
    const totalRecordedVolume = transaction.processor === 'TRNXN' 
      ? recordedVolume  // Already combined during upload
      : recordedVolume + recordedDebitVolume;
    
    // Skip transactions with no meaningful data
    if (agentPayout === 0 && totalRecordedVolume === 0) return;
    
    const matchedLocation = findMatchingLocation(transaction, locations);
    
    if (matchedLocation) {
      const locationId = matchedLocation.id;
      
      if (!locationMap.has(locationId)) {
        locationMap.set(locationId, {
          totalVolume: 0,
          totalAgentPayout: 0,
          transactionCount: 0
        });
      }
      
      const locationData = locationMap.get(locationId)!;
      locationData.totalVolume += totalRecordedVolume;
      locationData.totalAgentPayout += agentPayout;
      locationData.transactionCount += 1;
      
      console.log(`💰 Added transaction ${index + 1} to ${matchedLocation.name}: $${agentPayout.toLocaleString()} payout, $${totalRecordedVolume.toLocaleString()} volume`);
    } else {
      totalUnmatchedPayout += agentPayout;
      unmatchedCount++;
      console.log(`⚠️ Unmatched transaction ${index + 1}: $${agentPayout.toLocaleString()} payout`);
    }
  });

  console.log(`📊 Matched ${transactions.length - unmatchedCount} transactions to locations`);
  console.log(`⚠️ ${unmatchedCount} transactions unmatched with $${totalUnmatchedPayout.toLocaleString()} total payout`);

  // If we have unmatched transactions and some successful matches, distribute proportionally
  if (totalUnmatchedPayout > 0 && locationMap.size > 0) {
    const totalMatchedPayout = Array.from(locationMap.values()).reduce((sum, data) => sum + data.totalAgentPayout, 0);
    
    if (totalMatchedPayout > 0) {
      console.log(`📊 Distributing $${totalUnmatchedPayout.toLocaleString()} unmatched payout proportionally`);
      
      locationMap.forEach((locationData, locationId) => {
        const proportion = locationData.totalAgentPayout / totalMatchedPayout;
        const additionalPayout = totalUnmatchedPayout * proportion;
        locationData.totalAgentPayout += additionalPayout;
        
        console.log(`📊 Added $${additionalPayout.toLocaleString()} to location ${locationId}`);
      });
    }
  }

  const commissions: LocationCommission[] = [];

  // Process each location that has data
  locationMap.forEach((locationData, locationId) => {
    const location = locations.find(l => l.id === locationId);
    if (!location) return;

    const locationAssignments = assignments.filter(a => a.location_id === locationId && a.is_active);
    
    console.log(`💼 Processing location: ${location.name}`);
    console.log(`💼 - Recorded Volume: $${locationData.totalVolume.toLocaleString()}`);
    console.log(`💼 - Total Agent Payout: $${locationData.totalAgentPayout.toLocaleString()}`);
    console.log(`💼 - Assigned Agents: ${locationAssignments.map(a => a.agent_name).join(', ')}`);

    const otherAgents = locationAssignments.filter(a => a.agent_name !== 'Merchant Hero');
    const merchantHeroAssignment = locationAssignments.find(a => a.agent_name === 'Merchant Hero');
    
    let totalCommissionsPaid = 0;
    
    // FIXED LOGIC: Calculate realistic volume from agent payouts
    const totalAgentCommissions = locationData.totalAgentPayout;
    
    // If we have recorded volume, use it. Otherwise, estimate from payouts
    let estimatedVolume = locationData.totalVolume;
    
    if (estimatedVolume === 0 && totalAgentCommissions > 0) {
      // Estimate volume based on average commission rate
      const averageRate = locationAssignments.reduce((sum, a) => sum + a.commission_rate, 0) / locationAssignments.length;
      if (averageRate > 0) {
        estimatedVolume = totalAgentCommissions / (averageRate / 100);
      }
    }
    
    console.log(`🔍 Volume calculation for ${location.name}:`);
    console.log(`   - Recorded volume: $${locationData.totalVolume.toLocaleString()}`);
    console.log(`   - Estimated volume: $${estimatedVolume.toLocaleString()}`);
    console.log(`   - Total agent commissions: $${totalAgentCommissions.toLocaleString()}`);
    
    // Calculate payouts for other agents based on their commission rates
    otherAgents.forEach(assignment => {
      const bpsDecimal = assignment.commission_rate / 100;
      
      // For non-Merchant Hero agents, distribute the total agent payout proportionally
      let agentCommission = 0;
      let agentVolume = 0;
      
      if (totalAgentCommissions > 0 && otherAgents.length > 0) {
        // Distribute proportionally based on their commission rates
        const totalOtherAgentRates = otherAgents.reduce((sum, a) => sum + a.commission_rate, 0);
        const agentProportion = assignment.commission_rate / totalOtherAgentRates;
        agentCommission = totalAgentCommissions * agentProportion;
        
        // Calculate agent's volume based on their commission
        if (bpsDecimal > 0) {
          agentVolume = agentCommission / bpsDecimal;
        }
      }
      
      totalCommissionsPaid += agentCommission;
      
      console.log(`💰 ${assignment.agent_name} → ${Math.round(assignment.commission_rate * 100)} BPS → $${agentCommission.toLocaleString()}`);

      commissions.push({
        locationId: location.id,
        locationName: location.name,
        agentName: assignment.agent_name,
        bpsRate: Math.round(assignment.commission_rate * 100),
        decimalRate: bpsDecimal,
        locationVolume: agentVolume,
        netAgentPayout: totalAgentCommissions,
        agentPayout: agentCommission,
        merchantHeroPayout: 0
      });
    });

    // Calculate Merchant Hero's earnings (remainder from actual payouts)
    if (merchantHeroAssignment) {
      const merchantHeroPayout = Math.max(0, totalAgentCommissions - totalCommissionsPaid);
      let merchantHeroVolume = 0;
      const merchantHeroBPS = merchantHeroAssignment.commission_rate * 100;
      
      // Calculate volume for Merchant Hero based on their commission rate
      if (merchantHeroAssignment.commission_rate > 0) {
        merchantHeroVolume = merchantHeroPayout / (merchantHeroAssignment.commission_rate / 100);
      }
      
      console.log(`💰 Merchant Hero → ${merchantHeroBPS} BPS → $${merchantHeroPayout.toLocaleString()}`);

      commissions.push({
        locationId: location.id,
        locationName: location.name,
        agentName: merchantHeroAssignment.agent_name,
        bpsRate: merchantHeroBPS,
        decimalRate: merchantHeroAssignment.commission_rate / 100,
        locationVolume: merchantHeroVolume,
        netAgentPayout: totalAgentCommissions,
        agentPayout: 0,
        merchantHeroPayout
      });
    }
  });

  console.log('🎯 === COMMISSION CALC WITH REALISTIC VOLUME LOGIC END ===');
  console.log(`🎉 Generated ${commissions.length} commission records`);
  
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
