
// Utility functions for BPS rate calculations and display
export const convertToBPSDisplay = (storedRate: number): number => {
  // Handle different storage formats:
  // - Decimal format: 0.75 = 75 BPS
  // - Raw BPS format: 7500 = 75 BPS  
  // - Already correct: 75 = 75 BPS
  
  if (storedRate <= 1) {
    // Stored as decimal (0.75)
    return Math.round(storedRate * 100);
  } else if (storedRate > 100) {
    // Stored as raw value (7500)
    return Math.round(storedRate / 100);
  } else {
    // Already in correct BPS format (75)
    return Math.round(storedRate);
  }
};

export const convertToDecimalRate = (storedRate: number): number => {
  // Convert any format to decimal for calculations
  
  if (storedRate <= 1) {
    // Already decimal (0.75)
    return storedRate;
  } else if (storedRate > 100) {
    // Raw value (7500) -> decimal (0.75)
    return storedRate / 10000;
  } else {
    // BPS value (75) -> decimal (0.75)
    return storedRate / 100;
  }
};
