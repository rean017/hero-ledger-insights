
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";

export interface TimeFrameOption {
  value: string;
  label: string;
  dateRange: {
    from: Date;
    to: Date;
  } | null;
}

export const getDynamicTimeFrames = (): TimeFrameOption[] => {
  // Fixed to show March 2025 first since that's where the data is
  const march2025 = new Date("2025-03-01");
  const april2025 = new Date("2025-04-01");
  const may2025 = new Date("2025-05-01");
  const june2025 = new Date("2025-06-01");
  
  console.log('🗓️ Dynamic timeframes being generated for March 2025 data');
  
  return [
    {
      value: "march",
      label: "March",
      dateRange: {
        from: new Date("2025-03-01T00:00:00.000Z"),
        to: new Date("2025-03-31T23:59:59.999Z")
      }
    },
    {
      value: "april",
      label: "April",
      dateRange: {
        from: new Date("2025-04-01T00:00:00.000Z"),
        to: new Date("2025-04-30T23:59:59.999Z")
      }
    },
    {
      value: "may",
      label: "May",
      dateRange: {
        from: new Date("2025-05-01T00:00:00.000Z"),
        to: new Date("2025-05-31T23:59:59.999Z")
      }
    },
    {
      value: "june",
      label: "June",
      dateRange: {
        from: new Date("2025-06-01T00:00:00.000Z"),
        to: new Date("2025-06-30T23:59:59.999Z")
      }
    }
  ];
};

export const getDateRangeForTimeFrame = (timeFrame: string): { from: Date; to: Date } | null => {
  console.log('🎯 Getting date range for timeframe:', timeFrame);
  
  const timeFrames = getDynamicTimeFrames();
  const selectedFrame = timeFrames.find(frame => frame.value === timeFrame);
  
  console.log('📅 Available timeframes:', timeFrames.map(tf => ({ value: tf.value, label: tf.label })));
  console.log('🎯 Selected frame:', selectedFrame);
  
  if (selectedFrame?.dateRange) {
    console.log('📊 Date range result:', {
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

// Helper function to get month string in YYYY-MM format (same as FileUpload)
export const getMonthString = (date: Date): string => {
  return format(date, 'yyyy-MM');
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
