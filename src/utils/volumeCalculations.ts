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
    console.log(`📊 TRNXN Volume: ${volume} (already combined)`);
    return volume;
  } else {
    const total = volume + debitVolume;
    console.log(`📊 ${transaction.processor || 'Unknown'} Volume: ${volume} + ${debitVolume} = ${total}`);
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
  return transactions.reduce((sum, transaction) => {
    return sum + calculateTransactionVolume(transaction);
  }, 0);
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
  const locationTransactions = transactions.filter(t => {
    const hasLocation = locationId && (t as any).location_id === locationId;
    const hasAccount = accountId && (t as any).account_id === accountId;
    return hasLocation || hasAccount;
  });
  
  const total = calculateTotalVolume(locationTransactions);
  console.log(`📊 Location Volume (${locationId}): ${total} from ${locationTransactions.length} transactions`);
  return total;
};