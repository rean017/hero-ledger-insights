
// Utility functions for BPS rate calculations and display
export const convertToBPSDisplay = (storedRate: number): number => {
  console.log('convertToBPSDisplay input:', storedRate, 'type:', typeof storedRate);
  
  // The rate is stored as decimal in database (e.g., 0.75 for 75 BPS)
  // We need to convert it back to BPS display format (1-100 range)
  
  if (storedRate <= 1) {
    // Stored as decimal (0.75 for 75 BPS) -> multiply by 100 to get BPS display
    const result = Math.round(storedRate * 100);
    console.log('Converting decimal to BPS:', storedRate, '->', result);
    return result;
  } else if (storedRate > 100) {
    // Already in raw format (7500 for 75 BPS) -> divide by 100 to get display BPS
    const result = Math.round(storedRate / 100);
    console.log('Converting raw to BPS:', storedRate, '->', result);
    return result;
  } else {
    // Already in correct BPS format (75)
    console.log('Already in BPS format:', storedRate);
    return Math.round(storedRate);
  }
};

export const convertToDecimalRate = (storedRate: number): number => {
  console.log('convertToDecimalRate input:', storedRate);
  
  // Convert BPS to proper decimal for commission calculations
  // Formula: BPS ÷ 10,000 = decimal rate
  // Example: 75 BPS ÷ 10,000 = 0.0075
  
  if (storedRate <= 1) {
    // Already a small decimal, assume it's in the format we need for calculations
    // But we need to convert it to the proper BPS decimal format
    // If it's 0.75, it represents 75 BPS, so we need 0.0075 for calculations
    const result = storedRate / 100;
    console.log('Converting stored decimal to calculation decimal:', storedRate, '->', result);
    return result;
  } else if (storedRate > 100) {
    // Raw value (7500) -> decimal (0.0075)
    const result = storedRate / 1000000; // Divide by 1,000,000 to get proper decimal
    console.log('Converting raw to decimal:', storedRate, '->', result);
    return result;
  } else {
    // BPS value (75) -> decimal (0.0075)
    const result = storedRate / 10000; // Divide by 10,000 to get proper decimal
    console.log('Converting BPS to decimal:', storedRate, '->', result);
    return result;
  }
};
