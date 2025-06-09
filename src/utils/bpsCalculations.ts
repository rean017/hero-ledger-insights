
// Utility functions for BPS rate calculations and display
export const convertToBPSDisplay = (storedRate: number): number => {
  console.log('convertToBPSDisplay input:', storedRate, 'type:', typeof storedRate);
  
  // The rate is stored as decimal in database (e.g., 0.40 for 40 BPS)
  // We need to convert it back to BPS display format (1-100 range)
  
  if (storedRate <= 1) {
    // Stored as decimal (0.40 for 40 BPS) -> multiply by 100 to get BPS display
    const result = Math.round(storedRate * 100);
    console.log('Converting decimal to BPS:', storedRate, '->', result);
    return result;
  } else if (storedRate > 100) {
    // Already in raw format (4000 for 40 BPS) -> divide by 100 to get display BPS
    const result = Math.round(storedRate / 100);
    console.log('Converting raw to BPS:', storedRate, '->', result);
    return result;
  } else {
    // Already in correct BPS format (40)
    console.log('Already in BPS format:', storedRate);
    return Math.round(storedRate);
  }
};

export const convertToDecimalRate = (storedRate: number): number => {
  console.log('convertToDecimalRate input:', storedRate);
  
  // Convert any format to decimal for calculations
  if (storedRate <= 1) {
    // Already decimal (0.40) - this is what we use for calculations
    console.log('Using decimal rate:', storedRate);
    return storedRate;
  } else if (storedRate > 100) {
    // Raw value (4000) -> decimal (0.40)
    const result = storedRate / 10000;
    console.log('Converting raw to decimal:', storedRate, '->', result);
    return result;
  } else {
    // BPS value (40) -> decimal (0.40)
    const result = storedRate / 100;
    console.log('Converting BPS to decimal:', storedRate, '->', result);
    return result;
  }
};
