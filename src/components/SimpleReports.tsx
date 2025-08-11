import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Download, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface CommissionReportData {
  agentName: string;
  totalVolume: number;
  totalPayout: number;
  merchantHeroPayout: number;
  avgBPS: number;
  locationCount: number;
}

interface PLReportData {
  month: string;
  totalVolume: number;
  totalPayout: number;
  netIncome: number;
}

export const SimpleReports = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Get available months
  const { data: availableMonths = [] } = useQuery({
    queryKey: ['available-months'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_data')
        .select('month')
        .order('month', { ascending: false });
      
      if (error) throw error;
      
      const uniqueMonths = [...new Set(data.map(d => d.month))];
      return uniqueMonths;
    }
  });

  // Set default month to the latest available
  React.useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // Get commission report data
  const { data: commissionData = [], isLoading: isCommissionLoading } = useQuery({
    queryKey: ['commission-report', selectedMonth],
    queryFn: async (): Promise<CommissionReportData[]> => {
      if (!selectedMonth) return [];

      const { data, error } = await supabase
        .from('monthly_data')
        .select('*')
        .eq('month', selectedMonth);
      
      if (error) throw error;

      // Group by agent
      const agentMap = new Map<string, CommissionReportData>();
      
      data.forEach(row => {
        if (!agentMap.has(row.agent_name)) {
          agentMap.set(row.agent_name, {
            agentName: row.agent_name,
            totalVolume: 0,
            totalPayout: 0,
            merchantHeroPayout: 0,
            avgBPS: 0,
            locationCount: 0
          });
        }
        
        const agent = agentMap.get(row.agent_name)!;
        agent.totalVolume += Number(row.volume);
        agent.totalPayout += Number(row.agent_payout);
        agent.locationCount += 1;
      });

      // Calculate derived values
      const result = Array.from(agentMap.values()).map(agent => ({
        ...agent,
        merchantHeroPayout: agent.totalVolume - agent.totalPayout,
        avgBPS: agent.totalVolume > 0 ? (agent.totalPayout / agent.totalVolume) * 10000 : 0
      }));

      return result.sort((a, b) => b.totalVolume - a.totalVolume);
    },
    enabled: !!selectedMonth
  });

  // Get P&L report data (all months)
  const { data: plData = [], isLoading: isPLLoading } = useQuery({
    queryKey: ['pl-report'],
    queryFn: async (): Promise<PLReportData[]> => {
      const { data, error } = await supabase
        .from('monthly_data')
        .select('*')
        .order('month', { ascending: false });
      
      if (error) throw error;

      // Group by month
      const monthMap = new Map<string, PLReportData>();
      
      data.forEach(row => {
        if (!monthMap.has(row.month)) {
          monthMap.set(row.month, {
            month: row.month,
            totalVolume: 0,
            totalPayout: 0,
            netIncome: 0
          });
        }
        
        const monthData = monthMap.get(row.month)!;
        monthData.totalVolume += Number(row.volume);
        monthData.totalPayout += Number(row.agent_payout);
      });

      // Calculate net income
      const result = Array.from(monthMap.values()).map(monthData => ({
        ...monthData,
        netIncome: monthData.totalVolume - monthData.totalPayout
      }));

      return result;
    }
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatMonthDisplay = (monthStr: string) => {
    try {
      return format(parseISO(monthStr), 'MMMM yyyy');
    } catch {
      return monthStr;
    }
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (!data.length) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header];
        if (typeof value === 'number' && (header.includes('Volume') || header.includes('Payout') || header.includes('Income'))) {
          return value.toFixed(2);
        }
        return value;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Commission and P&L reporting</p>
        </div>
      </div>

      <Tabs defaultValue="commission" className="space-y-6">
        <TabsList>
          <TabsTrigger value="commission">Commission Reports</TabsTrigger>
          <TabsTrigger value="pl">P&L Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="commission" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="w-48">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map(month => (
                    <SelectItem key={month} value={month}>
                      {formatMonthDisplay(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {commissionData.length > 0 && (
              <Button 
                onClick={() => downloadCSV(commissionData, `commission-report-${selectedMonth}.csv`)}
                variant="outline"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            )}
          </div>

          {selectedMonth && commissionData.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Commission Report - {formatMonthDisplay(selectedMonth)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent Name</TableHead>
                      <TableHead>Locations</TableHead>
                      <TableHead>Total Volume</TableHead>
                      <TableHead>Agent Payout</TableHead>
                      <TableHead>Merchant Hero Payout</TableHead>
                      <TableHead>Avg BPS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissionData.map((agent) => (
                      <TableRow key={agent.agentName}>
                        <TableCell className="font-medium">{agent.agentName}</TableCell>
                        <TableCell>{agent.locationCount}</TableCell>
                        <TableCell>{formatCurrency(agent.totalVolume)}</TableCell>
                        <TableCell>{formatCurrency(agent.totalPayout)}</TableCell>
                        <TableCell>{formatCurrency(agent.merchantHeroPayout)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {agent.avgBPS.toFixed(0)} BPS
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : selectedMonth && !isCommissionLoading ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Data Available</h3>
                <p className="text-muted-foreground text-center">
                  No commission data found for {formatMonthDisplay(selectedMonth)}.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Month</h3>
                <p className="text-muted-foreground text-center">
                  Choose a month to generate commission reports.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pl" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Profit & Loss Overview</h2>
            
            {plData.length > 0 && (
              <Button 
                onClick={() => downloadCSV(plData, 'pl-report.csv')}
                variant="outline"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            )}
          </div>

          {plData.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Monthly P&L Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Total Volume</TableHead>
                      <TableHead>Total Agent Payout</TableHead>
                      <TableHead>Net Income</TableHead>
                      <TableHead>Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plData.map((monthData) => {
                      const marginPercent = monthData.totalVolume > 0 
                        ? (monthData.netIncome / monthData.totalVolume) * 100 
                        : 0;

                      return (
                        <TableRow key={monthData.month}>
                          <TableCell className="font-medium">
                            {formatMonthDisplay(monthData.month)}
                          </TableCell>
                          <TableCell>{formatCurrency(monthData.totalVolume)}</TableCell>
                          <TableCell>{formatCurrency(monthData.totalPayout)}</TableCell>
                          <TableCell>{formatCurrency(monthData.netIncome)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {marginPercent.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No P&L Data Available</h3>
                <p className="text-muted-foreground text-center">
                  Upload monthly data to generate profit and loss reports.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};