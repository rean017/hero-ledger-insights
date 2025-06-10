
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
  const now = new Date();
  
  // Get the last 3 months - but we need to handle the current date properly
  // Since we're in June 2025, we should show Apr, May, Jun
  const currentMonth = now;
  const lastMonth = subMonths(now, 1);
  const twoMonthsAgo = subMonths(now, 2);
  
  console.log('🗓️ Dynamic timeframes being generated:', {
    currentMonth: format(currentMonth, 'MMM yyyy'),
    lastMonth: format(lastMonth, 'MMM yyyy'),
    twoMonthsAgo: format(twoMonthsAgo, 'MMM yyyy')
  });
  
  return [
    {
      value: format(twoMonthsAgo, 'MMM').toLowerCase(),
      label: format(twoMonthsAgo, 'MMM'),
      dateRange: {
        // FIXED: Use UTC dates to match transaction date parsing
        from: new Date(Date.UTC(twoMonthsAgo.getFullYear(), twoMonthsAgo.getMonth(), 1)),
        to: new Date(Date.UTC(twoMonthsAgo.getFullYear(), twoMonthsAgo.getMonth() + 1, 0, 23, 59, 59, 999))
      }
    },
    {
      value: format(lastMonth, 'MMM').toLowerCase(),
      label: format(lastMonth, 'MMM'),
      dateRange: {
        // FIXED: Use UTC dates to match transaction date parsing
        from: new Date(Date.UTC(lastMonth.getFullYear(), lastMonth.getMonth(), 1)),
        to: new Date(Date.UTC(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0, 23, 59, 59, 999))
      }
    },
    {
      value: format(currentMonth, 'MMM').toLowerCase(),
      label: format(currentMonth, 'MMM'),
      dateRange: {
        // FIXED: Use UTC dates to match transaction date parsing
        from: new Date(Date.UTC(currentMonth.getFullYear(), currentMonth.getMonth(), 1)),
        to: new Date(Date.UTC(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59, 999))
      }
    },
    {
      value: 'custom',
      label: 'Custom',
      dateRange: null
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

// ADDED: Helper function to ensure consistent date formatting for database queries
export const formatDateForDatabase = (date: Date): string => {
  return format(date, 'yyyy-MM-dd');
};

// ADDED: Helper function to get month string in YYYY-MM format (same as FileUpload)
export const getMonthString = (date: Date): string => {
  return format(date, 'yyyy-MM');
};
