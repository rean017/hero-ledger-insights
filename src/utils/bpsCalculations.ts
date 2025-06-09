

// Utility functions for BPS rate calculations and display
export const convertToBPSDisplay = (storedRate: number): number => {
  // The rate is stored as decimal in database (e.g., 0.0075 for 75 BPS, 0.01 for 100 BPS)
  // We need to convert it back to BPS display format (1-100 range)
  
  if (storedRate <= 1) {
    // Stored as decimal (0.0075 for 75 BPS) -> multiply by 10000 to get BPS
    return Math.round(storedRate * 10000);
  } else if (storedRate > 100) {
    // Already in raw format (7500 for 75 BPS, 10000 for 100 BPS) -> divide by 100 to get display BPS
    return Math.round(storedRate / 100);
  } else {
    // Already in correct BPS format (75)
    return Math.round(storedRate);
  }
};

export const convertToDecimalRate = (storedRate: number): number => {
  // Convert any format to decimal for calculations
  
  if (storedRate <= 1) {
    // Already decimal (0.0075)
    return storedRate;
  } else if (storedRate > 100) {
    // Raw value (7500) -> decimal (0.0075)
    return storedRate / 10000;
  } else {
    // BPS value (75) -> decimal (0.0075)
    return storedRate / 10000;
  }
};

