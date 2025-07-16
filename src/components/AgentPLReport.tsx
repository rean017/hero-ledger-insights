import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Download, Printer, FileText, User, Building2, TrendingUp, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { calculateLocationCommissions } from "@/utils/commissionCalculations";
import { getDefaultTimeFrame } from "@/utils/timeFrameUtils";

const AgentPLReport = () => {
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("current-month");
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Initialize with smart date detection
  useEffect(() => {
    const initializeSmartDates = async () => {
      const defaultTimeFrame = await getDefaultTimeFrame();
      console.log('🎯 AGENT P&L: Smart date detection initialized with:', defaultTimeFrame);
      
      // Set the period to show the detected month if it's available
      if (defaultTimeFrame === "2025-04") {
        setSelectedPeriod("detected-month");
      }
    };
    
    initializeSmartDates();
  }, []);

  const getDateRange = (period: string) => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    switch (period) {
      case "detected-month":
        return {
          start: '2025-04-01',
          end: '2025-04-30',
          label: "April 2025 (Detected Upload)"
        };
      case "current-month":
        return {
          start: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`,
          label: "Current Month"
        };
      case "last-month":
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return {
          start: `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
          label: "Last Month"
        };
      case "current-quarter":
        const quarterStart = Math.floor(currentMonth / 3) * 3;
        return {
          start: `${currentYear}-${String(quarterStart + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(quarterStart + 4).padStart(2, '0')}-01`,
          label: "Current Quarter"
        };
      case "last-quarter":
        const lastQuarterStart = Math.floor(currentMonth / 3) * 3 - 3;
        let lastQuarterYear = currentYear;
        let adjustedQuarterStart = lastQuarterStart;
        
        if (lastQuarterStart < 0) {
          adjustedQuarterStart = 9; // Q4 of previous year
          lastQuarterYear = currentYear - 1;
        }
        
        return {
          start: `${lastQuarterYear}-${String(adjustedQuarterStart + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(Math.floor(currentMonth / 3) * 3 + 1).padStart(2, '0')}-01`,
          label: "Last Quarter"
        };
      case "custom":
        return {
          start: customStartDate ? format(customStartDate, 'yyyy-MM-dd') : '',
          end: customEndDate ? format(customEndDate, 'yyyy-MM-dd') : '',
          label: "Custom Range"
        };
      default:
        return {
          start: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`,
          label: "Current Month"
        };
    }
  };

  const dateRange = getDateRange(selectedPeriod);

  const { data: agents } = useQuery({
    queryKey: ['agents-for-pl'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data;
    }
  });

  // Agent P&L Report Generator
  const { data: agentReportData, isLoading: reportLoading } = useQuery({
    queryKey: ['agent-pl-report', selectedAgent, selectedPeriod, customStartDate, customEndDate],
    queryFn: async () => {
      if (!selectedAgent || !dateRange.start || !dateRange.end) return null;

      console.log(`Fetching agent P&L data for ${selectedAgent} (${dateRange.start} to ${dateRange.end})`);
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, agent_payout')
        .gte('transaction_date', dateRange.start)
        .lt('transaction_date', dateRange.end);

      if (error) throw error;

      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          is_active
        `)
        .eq('is_active', true)
        .eq('agent_name', selectedAgent);

      if (assignmentError) throw assignmentError;

      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('id, name, account_id');

      if (locationError) throw locationError;

      // Calculate commissions for this specific agent
      const commissions = calculateLocationCommissions(transactions || [], assignments || [], locations || []);
      
      // Filter commissions for the selected agent only
      const agentCommissions = commissions.filter(c => c.agentName === selectedAgent);
      
      const totalVolume = agentCommissions.reduce((sum, c) => sum + c.locationVolume, 0);
      const totalCommission = agentCommissions.reduce((sum, c) => sum + (c.agentName === 'Merchant Hero' ? c.merchantHeroPayout : c.agentPayout), 0);

      return {
        agentName: selectedAgent,
        locations: agentCommissions.map(commission => ({
          ...commission,
          commission: commission.agentName === 'Merchant Hero' ? commission.merchantHeroPayout : commission.agentPayout
        })),
        totalVolume,
        totalCommission,
        period: dateRange.label,
        dateRange: `${dateRange.start} to ${dateRange.end}`
      };
    },
    enabled: !!selectedAgent && !!dateRange.start && !!dateRange.end,
    refetchOnWindowFocus: false
  });

  // 12-month trailing history query
  const { data: trailingHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['12-month-trailing-history'],
    queryFn: async () => {
      const currentDate = new Date();
      const twelveMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 12, 1);
      
      console.log('Fetching 12-month trailing history from', format(twelveMonthsAgo, 'yyyy-MM-dd'));

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, agent_payout, transaction_date')
        .gte('transaction_date', format(twelveMonthsAgo, 'yyyy-MM-dd'));

      if (error) throw error;

      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          is_active
        `)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('id, name, account_id');

      if (locationError) throw locationError;

      // Group transactions by month and calculate monthly totals
      const monthlyData = transactions?.reduce((acc, transaction) => {
        const monthKey = format(new Date(transaction.transaction_date), 'yyyy-MM');
        if (!acc[monthKey]) {
          acc[monthKey] = [];
        }
        acc[monthKey].push(transaction);
        return acc;
      }, {} as Record<string, any[]>);

      const history = [];
      for (let i = 11; i >= 0; i--) {
        const month = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthKey = format(month, 'yyyy-MM');
        const monthTransactions = monthlyData?.[monthKey] || [];
        
        // Only calculate commissions if there are actual transactions
        if (monthTransactions.length > 0) {
          const commissions = calculateLocationCommissions(monthTransactions, assignments || [], locations || []);
          const totalVolume = commissions.reduce((sum, c) => sum + c.locationVolume, 0);
          const totalCommissions = commissions.reduce((sum, c) => sum + (c.agentName === 'Merchant Hero' ? c.merchantHeroPayout : c.agentPayout), 0);
          
          history.push({
            month: format(month, 'MMM yyyy'),
            totalVolume,
            totalCommissions,
            netIncome: totalVolume - totalCommissions
          });
        } else {
          // No transactions for this month, show zeros
          history.push({
            month: format(month, 'MMM yyyy'),
            totalVolume: 0,
            totalCommissions: 0,
            netIncome: 0
          });
        }
      }

      return history;
    },
    refetchOnWindowFocus: false
  });

  // Top 10 performers query
  const { data: topPerformers, isLoading: performersLoading } = useQuery({
    queryKey: ['top-10-performers'],
    queryFn: async () => {
      const currentDate = new Date();
      const threeMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 3, 1);
      
      console.log('Fetching top 10 performers data from', format(threeMonthsAgo, 'yyyy-MM-dd'));

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('volume, debit_volume, agent_name, account_id, agent_payout')
        .gte('transaction_date', format(threeMonthsAgo, 'yyyy-MM-dd'));

      if (error) throw error;

      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          is_active
        `)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('id, name, account_id');

      if (locationError) throw locationError;

      const commissions = calculateLocationCommissions(transactions || [], assignments || [], locations || []);
      
      // Sort by total volume and get top 10
      return commissions
        .sort((a, b) => b.locationVolume - a.locationVolume)
        .slice(0, 10)
        .map((item, index) => ({
          rank: index + 1,
          ...item,
          commission: item.agentName === 'Merchant Hero' ? item.merchantHeroPayout : item.agentPayout
        }));
    },
    refetchOnWindowFocus: false
  });

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Create a downloadable version
    const reportContent = generateReportHTML();
    const blob = new Blob([reportContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedAgent}_PL_Report_${dateRange.label.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateReportHTML = () => {
    if (!agentReportData) return '';

    return `
<!DOCTYPE html>
<html>
<head>
    <title>P&L Report - ${agentReportData.agentName}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .company-name { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
        .report-title { font-size: 20px; color: #666; }
        .report-info { margin: 20px 0; }
        .info-row { display: flex; justify-content: space-between; margin: 5px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .number { text-align: right; }
        .summary { margin-top: 30px; border-top: 2px solid #333; padding-top: 20px; }
        .summary-row { display: flex; justify-content: space-between; margin: 10px 0; font-size: 16px; }
        .total-row { font-weight: bold; font-size: 18px; border-top: 1px solid #333; padding-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-name">Agent Commission Report</div>
        <div class="report-title">Profit & Loss Statement</div>
    </div>
    
    <div class="report-info">
        <div class="info-row">
            <span><strong>Agent:</strong> ${agentReportData.agentName}</span>
            <span><strong>Period:</strong> ${agentReportData.period}</span>
        </div>
        <div class="info-row">
            <span><strong>Report Date:</strong> ${format(new Date(), 'MMMM dd, yyyy')}</span>
            <span><strong>Date Range:</strong> ${agentReportData.dateRange}</span>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>Location Name</th>
                <th>Commission Rate (BPS)</th>
                <th>Monthly Volume</th>
                <th>Commission Earned</th>
            </tr>
        </thead>
        <tbody>
            ${agentReportData.locations.map(location => `
                <tr>
                    <td>${location.locationName}</td>
                    <td class="number">${location.bpsRate} BPS</td>
                    <td class="number">$${location.locationVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td class="number">$${location.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="summary">
        <div class="summary-row">
            <span>Total Volume Processed:</span>
            <span>$${agentReportData.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="summary-row total-row">
            <span>Total Commission Earned:</span>
            <span>$${agentReportData.totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
    </div>
</body>
</html>
    `;
  };

  return (
    <div className="space-y-6">
      {/* Agent P&L Report Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Agent P&L Report Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Agent</label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents?.map((agent) => (
                    <SelectItem key={agent.id} value={agent.name}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Time Period</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="detected-month">April 2025 (Detected Upload)</SelectItem>
                  <SelectItem value="current-month">Current Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="current-quarter">Current Quarter</SelectItem>
                  <SelectItem value="last-quarter">Last Quarter</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedPeriod === "custom" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal",
                        !customStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, "PPP") : "Pick start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customStartDate}
                      onSelect={(date) => {
                        setCustomStartDate(date);
                        setStartDateOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal",
                        !customEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, "PPP") : "Pick end date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customEndDate}
                      onSelect={(date) => {
                        setCustomEndDate(date);
                        setEndDateOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {agentReportData && (
            <div className="flex gap-2 pt-4">
              <Button onClick={handlePrint} className="gap-2">
                <Printer className="h-4 w-4" />
                Print Report
              </Button>
              <Button onClick={handleDownload} variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Download Report
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {reportLoading && selectedAgent && (
        <Card>
          <CardContent className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">Generating report...</p>
          </CardContent>
        </Card>
      )}

      {agentReportData && (
        <Card className="print:shadow-none">
          <CardHeader className="print:pb-2">
            <div className="text-center space-y-2">
              <CardTitle className="text-2xl">Agent Commission Report</CardTitle>
              <p className="text-lg text-muted-foreground">Profit & Loss Statement</p>
            </div>
            <div className="flex justify-between items-center pt-4 text-sm">
              <div>
                <p><strong>Agent:</strong> {agentReportData.agentName}</p>
                <p><strong>Report Date:</strong> {format(new Date(), 'MMMM dd, yyyy')}</p>
              </div>
              <div className="text-right">
                <p><strong>Period:</strong> {agentReportData.period}</p>
                <p><strong>Date Range:</strong> {agentReportData.dateRange}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left p-4 font-semibold">Location Name</th>
                    <th className="text-right p-4 font-semibold">Commission Rate</th>
                    <th className="text-right p-4 font-semibold">Monthly Volume</th>
                    <th className="text-right p-4 font-semibold">Commission Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {agentReportData.locations.map((location, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {location.locationName}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <Badge variant="secondary">{location.bpsRate} BPS</Badge>
                      </td>
                      <td className="p-4 text-right font-semibold text-emerald-600">
                        ${location.locationVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right font-semibold text-blue-600">
                        ${location.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 pt-4 border-t-2 space-y-3">
              <div className="flex justify-between items-center text-lg">
                <span className="font-medium">Total Volume Processed:</span>
                <span className="font-semibold text-emerald-600">
                  ${agentReportData.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center text-xl border-t pt-2">
                <span className="font-bold">Total Commission Earned:</span>
                <span className="font-bold text-blue-600">
                  ${agentReportData.totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedAgent && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-32">
            <User className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">Select an agent to generate their P&L report</p>
          </CardContent>
        </Card>
      )}

      {/* 12-Month Trailing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            12-Month Trailing History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">Loading historical data...</p>
            </div>
          ) : trailingHistory && trailingHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left p-4 font-semibold">Month</th>
                    <th className="text-right p-4 font-semibold">Total Volume</th>
                    <th className="text-right p-4 font-semibold">Total Commissions</th>
                    <th className="text-right p-4 font-semibold">Net Income</th>
                  </tr>
                </thead>
                <tbody>
                  {trailingHistory.map((month, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50">
                      <td className="p-4 font-medium">{month.month}</td>
                      <td className="p-4 text-right font-semibold text-emerald-600">
                        ${month.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right font-semibold text-red-600">
                        ${month.totalCommissions.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right font-semibold text-blue-600">
                        ${month.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No historical data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top 10 Performers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Top 10 Performers (Last 3 Months by Volume)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {performersLoading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">Loading top performers...</p>
            </div>
          ) : topPerformers && topPerformers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left p-4 font-semibold">Rank</th>
                    <th className="text-left p-4 font-semibold">Agent</th>
                    <th className="text-left p-4 font-semibold">Location</th>
                    <th className="text-right p-4 font-semibold">Total Volume</th>
                    <th className="text-right p-4 font-semibold">Commission Earned</th>
                    <th className="text-right p-4 font-semibold">BPS Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {topPerformers.map((performer) => (
                    <tr key={`${performer.agentName}-${performer.locationId}`} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {performer.rank <= 3 && (
                            <Trophy className={`h-4 w-4 ${
                              performer.rank === 1 ? 'text-yellow-500' :
                              performer.rank === 2 ? 'text-gray-400' :
                              'text-amber-600'
                            }`} />
                          )}
                          <span className="font-bold">#{performer.rank}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="secondary">{performer.agentName}</Badge>
                      </td>
                      <td className="p-4 font-medium">{performer.locationName}</td>
                      <td className="p-4 text-right font-semibold text-emerald-600">
                        ${performer.locationVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right font-semibold text-blue-600">
                        ${performer.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right">
                        <Badge variant="outline">{performer.bpsRate} BPS</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No performance data available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentPLReport;
