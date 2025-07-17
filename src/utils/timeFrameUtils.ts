
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";

export interface TimeFrameOption {
  value: string;
  label: string;
  dateRange: {
    from: Date;
    to: Date;
  } | null;
}

// Get dynamic time frames based on actual data in the database
export const getDynamicTimeFrames = async (availableMonths: string[]): Promise<TimeFrameOption[]> => {
  console.log('🗓️ Dynamic timeframes being generated from available months:', availableMonths);
  
  return availableMonths.map(monthString => {
    const [year, month] = monthString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    
    return {
      value: monthString,
      label: format(date, 'MMMM yyyy'),
      dateRange: {
        from: startOfMonth(date),
        to: endOfMonth(date)
      }
    };
  }).sort((a, b) => b.value.localeCompare(a.value)); // Sort newest first
};

// Legacy function for backward compatibility - now uses fixed months
export const getDynamicTimeFramesLegacy = (): TimeFrameOption[] => {
  const march2025 = new Date("2025-03-01");
  const april2025 = new Date("2025-04-01");
  const may2025 = new Date("2025-05-01");
  const june2025 = new Date("2025-06-01");
  
  console.log('🗓️ Legacy dynamic timeframes being generated');
  
  return [
    {
      value: "2025-03",
      label: "March 2025",
      dateRange: {
        from: startOfMonth(march2025),
        to: endOfMonth(march2025)
      }
    },
    {
      value: "2025-04",
      label: "April 2025",
      dateRange: {
        from: startOfMonth(april2025),
        to: endOfMonth(april2025)
      }
    },
    {
      value: "2025-05",
      label: "May 2025",
      dateRange: {
        from: startOfMonth(may2025),
        to: endOfMonth(may2025)
      }
    },
    {
      value: "2025-06",
      label: "June 2025",
      dateRange: {
        from: startOfMonth(june2025),
        to: endOfMonth(june2025)
      }
    }
  ];
};

export const getDateRangeForTimeFrame = (timeFrame: string): { from: Date; to: Date } | null => {
  console.log('🎯 Getting date range for timeframe:', timeFrame);
  
  // Handle YYYY-MM format
  if (timeFrame.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = timeFrame.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    
    const result = {
      from: startOfMonth(date),
      to: endOfMonth(date)
    };
    
    console.log('📊 Date range result:', {
      from: result.from.toISOString(),
      to: result.to.toISOString(),
      fromFormatted: format(result.from, 'yyyy-MM-dd'),
      toFormatted: format(result.to, 'yyyy-MM-dd')
    });
    
    return result;
  }
  
  // Legacy handling for old format
  const legacyFrames = getDynamicTimeFramesLegacy();
  const selectedFrame = legacyFrames.find(frame => frame.value === timeFrame);
  
  if (selectedFrame?.dateRange) {
    console.log('📊 Legacy date range result:', {
      from: selectedFrame.dateRange.from.toISOString(),
      to: selectedFrame.dateRange.to.toISOString(),
      fromFormatted: format(selectedFrame.dateRange.from, 'yyyy-MM-dd'),
      toFormatted: format(selectedFrame.dateRange.to, 'yyyy-MM-dd')
    });
  }
  
  return selectedFrame?.dateRange || null;
};

// Helper function to ensure consistent date formatting for database queries
export const formatDateForDatabase = (date: Date): string => {
  return format(date, 'yyyy-MM-dd');
};

// Helper function to get month string in YYYY-MM format
export const getMonthString = (date: Date): string => {
  return format(date, 'yyyy-MM');
};

// Helper function to get available months from transaction data
export const getAvailableMonths = (transactions: any[]): string[] => {
  const months = new Set<string>();
  
  transactions.forEach(transaction => {
    if (transaction.transaction_date) {
      const monthString = getMonthString(new Date(transaction.transaction_date));
      months.add(monthString);
    }
  });
  
  return Array.from(months).sort().reverse(); // Sort newest first
};

// Helper function to normalize custom date ranges to match transaction format with proper validation
export const normalizeCustomDateRange = (range: { from: Date; to: Date }): { from: Date; to: Date } => {
  // Validate that both dates exist and are valid
  if (!range.from || !range.to) {
    throw new Error('Both from and to dates are required');
  }
  
  // Check if dates are valid Date objects
  if (!(range.from instanceof Date) || !(range.to instanceof Date)) {
    throw new Error('Invalid date objects provided');
  }
  
  // Check if dates have valid time values
  if (isNaN(range.from.getTime()) || isNaN(range.to.getTime())) {
    throw new Error('Invalid time values in date range');
  }
  
  try {
    return {
      from: new Date(format(range.from, 'yyyy-MM-dd') + 'T00:00:00.000Z'),
      to: new Date(format(range.to, 'yyyy-MM-dd') + 'T23:59:59.999Z')
    };
  } catch (error) {
    console.error('Error normalizing custom date range:', error);
    throw new Error('Failed to normalize date range');
  }
};

// Helper function to calculate trailing months based on actual data
export const getTrailingMonths = (availableMonths: string[], count: number = 12): string[] => {
  return availableMonths.slice(0, count);
};
