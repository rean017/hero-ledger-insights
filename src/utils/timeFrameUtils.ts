
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";

export interface TimeFrameOption {
  value: string;
  label: string;
  dateRange: {
    from: Date;
    to: Date;
  } | null;
}

// Helper function to detect the most recent upload month from transaction data
export const detectUploadMonth = async () => {
  const { supabase } = await import("@/integrations/supabase/client");
  
  try {
    // Get the most recent transaction date to determine which month has data
    const { data: recentTransaction } = await supabase
      .from('transactions')
      .select('transaction_date')
      .order('transaction_date', { ascending: false })
      .limit(1)
      .single();

    if (recentTransaction?.transaction_date) {
      const date = new Date(recentTransaction.transaction_date);
      const monthKey = format(date, 'yyyy-MM');
      console.log('🎯 SMART DATE DETECTION: Most recent transaction date:', recentTransaction.transaction_date);
      console.log('🎯 SMART DATE DETECTION: Detected month:', monthKey);
      return monthKey;
    }
  } catch (error) {
    console.error('Error detecting upload month:', error);
  }
  
  return null;
};

export const getDynamicTimeFrames = async (): Promise<TimeFrameOption[]> => {
  const detectedMonth = await detectUploadMonth();
  
  console.log('🗓️ SMART TIMEFRAMES: Auto-detected upload month:', detectedMonth);
  
  // If we detected a month, prioritize it and show surrounding months
  if (detectedMonth) {
    const [year, month] = detectedMonth.split('-').map(Number);
    const detectedDate = new Date(year, month - 1, 1);
    
    // Create timeframes around the detected month
    const timeframes = [];
    
    // Add previous month
    const prevMonth = new Date(year, month - 2, 1);
    timeframes.push({
      value: format(prevMonth, 'yyyy-MM'),
      label: format(prevMonth, 'MMM yyyy'),
      dateRange: {
        from: startOfMonth(prevMonth),
        to: endOfMonth(prevMonth)
      }
    });
    
    // Add detected month (current data)
    timeframes.push({
      value: detectedMonth,
      label: `${format(detectedDate, 'MMM yyyy')} (Current Data)`,
      dateRange: {
        from: startOfMonth(detectedDate),
        to: endOfMonth(detectedDate)
      }
    });
    
    // Add next month
    const nextMonth = new Date(year, month, 1);
    timeframes.push({
      value: format(nextMonth, 'yyyy-MM'),
      label: format(nextMonth, 'MMM yyyy'),
      dateRange: {
        from: startOfMonth(nextMonth),
        to: endOfMonth(nextMonth)
      }
    });
    
    // Add one more future month
    const futureMonth = new Date(year, month + 1, 1);
    timeframes.push({
      value: format(futureMonth, 'yyyy-MM'),
      label: format(futureMonth, 'MMM yyyy'),
      dateRange: {
        from: startOfMonth(futureMonth),
        to: endOfMonth(futureMonth)
      }
    });
    
    console.log('🎯 SMART TIMEFRAMES: Generated dynamic timeframes:', timeframes);
    return timeframes;
  }
  
  // Fallback to static timeframes if no data detected
  return [
    {
      value: "2025-03",
      label: "March 2025",
      dateRange: {
        from: new Date("2025-03-01T00:00:00.000Z"),
        to: new Date("2025-03-31T23:59:59.999Z")
      }
    },
    {
      value: "2025-04",
      label: "April 2025",
      dateRange: {
        from: new Date("2025-04-01T00:00:00.000Z"),
        to: new Date("2025-04-30T23:59:59.999Z")
      }
    },
    {
      value: "2025-05",
      label: "May 2025",
      dateRange: {
        from: new Date("2025-05-01T00:00:00.000Z"),
        to: new Date("2025-05-31T23:59:59.999Z")
      }
    },
    {
      value: "2025-06",
      label: "June 2025",
      dateRange: {
        from: new Date("2025-06-01T00:00:00.000Z"),
        to: new Date("2025-06-30T23:59:59.999Z")
      }
    }
  ];
};

export const getDateRangeForTimeFrame = async (timeFrame: string): Promise<{ from: Date; to: Date } | null> => {
  console.log('🎯 Getting date range for timeframe:', timeFrame);
  
  const timeFrames = await getDynamicTimeFrames();
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

// Helper function to get the default timeframe (should be the detected upload month)
export const getDefaultTimeFrame = async (): Promise<string> => {
  const detectedMonth = await detectUploadMonth();
  if (detectedMonth) {
    console.log('🎯 DEFAULT TIMEFRAME: Using detected month:', detectedMonth);
    return detectedMonth;
  }
  
  // Fallback to April 2025 if no data detected
  console.log('🎯 DEFAULT TIMEFRAME: Using fallback (April 2025)');
  return "2025-04";
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
