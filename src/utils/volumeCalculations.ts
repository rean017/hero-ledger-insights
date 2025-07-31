/**
 * Standardized volume calculation utility for all processors
 */

interface TransactionLike {
  volume?: number | string | null;
  debit_volume?: number | string | null;
  processor?: string;
}

/**
 * Calculate total volume for a transaction based on processor type
 * 
 * @param transaction - Transaction object with volume and debit_volume
 * @returns Total volume as number
 */
export const calculateTransactionVolume = (transaction: TransactionLike): number => {
  const volume = Number(transaction.volume) || 0;
  const debitVolume = Number(transaction.debit_volume) || 0;
  
  // For TRNXN: volume field already contains combined Bankcard + Debit volume
  // For all other processors: add volume + debit_volume
  if (transaction.processor === 'TRNXN') {
    console.log(`🎯 SINGLE TRNXN TRANSACTION CALC:`, {
      processor: transaction.processor,
      volume: volume,
      debitVolume: debitVolume,
      calculated: volume,
      raw: transaction
    });
    return volume;
  } else {
    const total = volume + debitVolume;
    console.log(`🎯 ${transaction.processor || 'Unknown'} Volume: ${volume} + ${debitVolume} = ${total}`);
    return total;
  }
};

/**
 * Calculate total volume for an array of transactions
 * 
 * @param transactions - Array of transactions
 * @returns Total volume as number
 */
export const calculateTotalVolume = (transactions: TransactionLike[]): number => {
  console.log(`📊 CALCULATING TOTAL VOLUME FOR ${transactions.length} TRANSACTIONS`);
  
  const total = transactions.reduce((sum, transaction, index) => {
    const transactionVolume = calculateTransactionVolume(transaction);
    console.log(`  Transaction ${index + 1}: ${transaction.processor} = $${transactionVolume} (running total: $${sum + transactionVolume})`);
    return sum + transactionVolume;
  }, 0);
  
  console.log(`📊 TOTAL VOLUME CALCULATED: $${total} from ${transactions.length} transactions`);
  return total;
};

/**
 * Calculate volume for a specific location from transactions
 * 
 * @param transactions - Array of transactions  
 * @param locationId - Location ID to filter by
 * @param accountId - Account ID to filter by (optional)
 * @returns Total volume for the location
 */
export const calculateLocationVolume = (
  transactions: TransactionLike[], 
  locationId?: string, 
  accountId?: string
): number => {
  console.log(`🚀 CALCULATE LOCATION VOLUME START:`, {
    locationId: locationId,
    accountId: accountId,
    totalInputTransactions: transactions.length
  });

  const locationTransactions = transactions.filter(t => {
    const hasLocation = locationId && (t as any).location_id === locationId;
    const hasAccount = accountId && (t as any).account_id === accountId;
    const match = hasLocation || hasAccount;
    
    if (match && t.processor === 'TRNXN') {
      console.log(`✅ TRNXN TRANSACTION MATCHED:`, {
        locationId: locationId,
        accountId: accountId,
        transactionLocationId: (t as any).location_id,
        transactionAccountId: (t as any).account_id,
        hasLocation: hasLocation,
        hasAccount: hasAccount,
        processor: t.processor,
        volume: t.volume,
        debitVolume: t.debit_volume
      });
    }
    
    return match;
  });
  
  console.log(`🔍 LOCATION FILTER RESULT (${locationId || accountId}):`, {
    totalInputTransactions: transactions.length,
    filteredTransactions: locationTransactions.length,
    trnxnTransactions: locationTransactions.filter(t => t.processor === 'TRNXN').length,
    sampleTransaction: locationTransactions[0]
  });
  
  // Enhanced debugging for each location's transactions
  if (locationTransactions.length > 0) {
    console.log(`🔍 Location Transactions Debug (${locationId || accountId}):`, {
      transactionCount: locationTransactions.length,
      transactions: locationTransactions.map(t => ({
        processor: t.processor,
        volume: t.volume,
        debit_volume: t.debit_volume,
        calculated: calculateTransactionVolume(t)
      }))
    });
  }
  
  console.log(`🧮 ABOUT TO CALL calculateTotalVolume with ${locationTransactions.length} transactions for location: ${locationId || accountId}`);
  const total = calculateTotalVolume(locationTransactions);
  console.log(`🎯 Final Location Volume (${locationId || accountId}): $${total.toLocaleString()} from ${locationTransactions.length} transactions`);
  
  // Data integrity check for TRNXN locations
  if (locationTransactions.some(t => t.processor === 'TRNXN')) {
    const expectedVolume = 177088.88; // Known correct value for Brick & Brew
    if (Math.abs(total - expectedVolume) > 1000 && (locationId?.includes('brick') || accountId?.includes('1058') || (locationId || accountId || '').toLowerCase().includes('brick'))) {
      console.error(`🚨 VOLUME MISMATCH DETECTED for BRICK & BREW:`, {
        calculated: total,
        expected: expectedVolume,
        difference: total - expectedVolume,
        locationId: locationId,
        accountId: accountId,
        transactionCount: locationTransactions.length
      });
    }
  }
  
  return total;
};