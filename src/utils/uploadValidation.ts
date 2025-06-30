
export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  suggestions: string[];
}

export interface ParsedTransaction {
  location_name: string;
  account_id: string | null;
  volume: number;
  debit_volume: number;
  agent_payout: number;
  transaction_date: string | null;
  raw_data: any;
}

export const validateUploadData = (
  normalizedData: ParsedTransaction[],
  fileName: string
): ValidationResult => {
  const result: ValidationResult = {
    isValid: true,
    warnings: [],
    errors: [],
    suggestions: []
  };

  if (normalizedData.length === 0) {
    result.isValid = false;
    result.errors.push('No valid transactions found in the uploaded file');
    return result;
  }

  // Check for missing volume data
  const transactionsWithNoVolume = normalizedData.filter(t => 
    t.volume === 0 && t.debit_volume === 0 && t.agent_payout === 0
  );
  
  if (transactionsWithNoVolume.length > 0) {
    result.warnings.push(
      `${transactionsWithNoVolume.length} transactions have no volume or payout data`
    );
  }

  // Check for missing location data
  const transactionsWithNoLocation = normalizedData.filter(t => 
    !t.location_name || t.location_name === 'Unknown Location'
  );
  
  if (transactionsWithNoLocation.length > 0) {
    result.warnings.push(
      `${transactionsWithNoLocation.length} transactions have no location name`
    );
  }

  // Check for missing account IDs
  const transactionsWithNoAccountId = normalizedData.filter(t => !t.account_id);
  
  if (transactionsWithNoAccountId.length > 0) {
    result.warnings.push(
      `${transactionsWithNoAccountId.length} transactions have no account ID - they will be distributed evenly across assigned locations`
    );
  }

  // Check for missing dates
  const transactionsWithNoDate = normalizedData.filter(t => !t.transaction_date);
  
  if (transactionsWithNoDate.length > 0) {
    result.errors.push(
      `${transactionsWithNoDate.length} transactions have no valid date`
    );
    result.isValid = false;
  }

  // Provide suggestions based on file content
  if (result.warnings.length > 0) {
    result.suggestions.push(
      'Consider reviewing your source file to ensure all required columns are present and properly formatted'
    );
  }

  if (transactionsWithNoAccountId.length === normalizedData.length) {
    result.suggestions.push(
      'All transactions are missing account IDs. Make sure your file includes a column like "Account ID", "MID", or "Merchant ID"'
    );
  }

  console.log('📋 UPLOAD VALIDATION: Validation results:', result);
  
  return result;
};

export const getFieldMappingSuggestions = (rawData: any[]): string[] => {
  if (rawData.length === 0) return [];
  
  const sampleRow = rawData[0];
  const availableFields = Object.keys(sampleRow);
  const suggestions: string[] = [];
  
  // Check for common field patterns
  const volumeFields = availableFields.filter(field => 
    /volume|amount|sales|transaction/i.test(field)
  );
  
  const locationFields = availableFields.filter(field => 
    /location|merchant|business|name/i.test(field)
  );
  
  const accountFields = availableFields.filter(field => 
    /account|mid|id/i.test(field)
  );
  
  if (volumeFields.length > 0) {
    suggestions.push(`Detected volume fields: ${volumeFields.join(', ')}`);
  }
  
  if (locationFields.length > 0) {
    suggestions.push(`Detected location fields: ${locationFields.join(', ')}`);
  }
  
  if (accountFields.length > 0) {
    suggestions.push(`Detected account fields: ${accountFields.join(', ')}`);
  }
  
  return suggestions;
};
