
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export const validateTransactionData = (data: any[]): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  console.log('🔍 DATA VALIDATION: Validating', data.length, 'transactions');

  // Check for required fields
  const requiredFields = ['volume', 'agent_payout', 'transaction_date'];
  const missingFields = requiredFields.filter(field => 
    !data.some(row => row[field] !== undefined && row[field] !== null)
  );

  if (missingFields.length > 0) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Check for data quality issues
  let zeroVolumeCount = 0;
  let negativeVolumeCount = 0;
  let missingDatesCount = 0;
  let futureDatesCount = 0;

  const now = new Date();
  
  data.forEach((row, index) => {
    const volume = Number(row.volume) || 0;
    const agentPayout = Number(row.agent_payout) || 0;
    const date = row.transaction_date ? new Date(row.transaction_date) : null;

    // Volume checks
    if (volume === 0) zeroVolumeCount++;
    if (volume < 0) negativeVolumeCount++;

    // Date checks
    if (!date || isNaN(date.getTime())) {
      missingDatesCount++;
    } else if (date > now) {
      futureDatesCount++;
    }

    // Extreme values check
    if (volume > 1000000) {
      warnings.push(`Row ${index + 1}: Unusually high volume ($${volume.toLocaleString()})`);
    }
    if (agentPayout > volume * 0.1) {
      warnings.push(`Row ${index + 1}: Agent payout (${agentPayout}) seems high relative to volume (${volume})`);
    }
  });

  // Generate warnings for data quality issues
  if (zeroVolumeCount > 0) {
    warnings.push(`${zeroVolumeCount} transactions have zero volume`);
  }
  if (negativeVolumeCount > 0) {
    errors.push(`${negativeVolumeCount} transactions have negative volume`);
  }
  if (missingDatesCount > 0) {
    errors.push(`${missingDatesCount} transactions have missing or invalid dates`);
  }
  if (futureDatesCount > 0) {
    warnings.push(`${futureDatesCount} transactions have future dates`);
  }

  // Generate suggestions
  if (warnings.length > 0) {
    suggestions.push('Review data quality before processing');
  }
  if (zeroVolumeCount > data.length * 0.1) {
    suggestions.push('Consider filtering out zero-volume transactions');
  }
  if (data.length > 10000) {
    suggestions.push('Large dataset detected - consider batch processing');
  }

  const result: ValidationResult = {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };

  console.log('✅ DATA VALIDATION: Complete', result);
  return result;
};

export const validateLocationData = (locations: any[]): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check for duplicate names
  const names = locations.map(l => l.name.toLowerCase());
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) {
    warnings.push(`Duplicate location names found: ${Array.from(new Set(duplicates)).join(', ')}`);
  }

  // Check for missing account IDs
  const missingAccountIds = locations.filter(l => !l.account_id).length;
  if (missingAccountIds > 0) {
    warnings.push(`${missingAccountIds} locations missing account IDs`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };
};
