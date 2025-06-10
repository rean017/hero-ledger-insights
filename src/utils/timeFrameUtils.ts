
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

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
        from: startOfMonth(twoMonthsAgo),
        to: endOfMonth(twoMonthsAgo)
      }
    },
    {
      value: format(lastMonth, 'MMM').toLowerCase(),
      label: format(lastMonth, 'MMM'),
      dateRange: {
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth)
      }
    },
    {
      value: format(currentMonth, 'MMM').toLowerCase(),
      label: format(currentMonth, 'MMM'),
      dateRange: {
        from: startOfMonth(currentMonth),
        to: endOfMonth(currentMonth)
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
      to: selectedFrame.dateRange.to.toISOString()
    });
  }
  
  return selectedFrame?.dateRange || null;
};
