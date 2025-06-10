
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
  
  // Get the last 3 months
  const currentMonth = now;
  const lastMonth = subMonths(now, 1);
  const twoMonthsAgo = subMonths(now, 2);
  
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
  const timeFrames = getDynamicTimeFrames();
  const selectedFrame = timeFrames.find(frame => frame.value === timeFrame);
  return selectedFrame?.dateRange || null;
};
