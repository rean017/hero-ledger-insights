import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Download, TrendingUp, Calculator } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAgentReport, type AgentRow } from '../hooks/useAgentReport';
import { formatMoneyExact } from '@/lib/numberFormat';

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

type Agent = { id: string; name: string };

export const SimpleReports = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [agentReportMonth, setAgentReportMonth] = useState<string>(dayjs().format('YYYY-MM'));

  // Get available months from stable facts table
  const { data: availableMonths = [] } = useQuery({
    queryKey: ['available-months'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facts_monthly_location')
        .select('month')
        .order('month', { ascending: false });
      
      if (error) throw error;
      
      const uniqueMonths = [...new Set(data.map(d => d.month))];
      return uniqueMonths;
    }
  });

  // Get agents for the agent reports tab
  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      return data as Agent[];
    }
  });

  // Use the agent report hook
  const { rows: agentRows, totals: agentTotals, loading: agentLoading, error: agentError, monthKey } = useAgentReport(selectedAgent, agentReportMonth);

  // Set default month to the latest available
  React.useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // Get commission report data from facts table
  const { data: commissionData = [], isLoading: isCommissionLoading } = useQuery({
    queryKey: ['commission-report', selectedMonth],
    queryFn: async (): Promise<CommissionReportData[]> => {
      if (!selectedMonth) return [];

      const { data, error } = await supabase
        .from('facts_monthly_location')
        .select(`
          total_volume,
          mh_net_payout,
          locations (
            name
          )
        `)
        .eq('month', selectedMonth);
      
      if (error) throw error;

      // Since we're now using MH net payout structure, create a single summary
      const totalVolume = data.reduce((sum, row) => sum + Number(row.total_volume), 0);
      const totalPayout = data.reduce((sum, row) => sum + Number(row.mh_net_payout), 0);
      const merchantHeroPayout = totalVolume - totalPayout;
      const avgBPS = totalVolume > 0 ? (totalPayout / totalVolume) * 10000 : 0;

      return [{
        agentName: 'Merchant Hero',
        totalVolume,
        totalPayout,
        merchantHeroPayout,
        avgBPS,
        locationCount: data.length
      }];
    },
    enabled: !!selectedMonth
  });

  // Get P&L report data (all months) from facts table
  const { data: plData = [], isLoading: isPLLoading } = useQuery({
    queryKey: ['pl-report'],
    queryFn: async (): Promise<PLReportData[]> => {
      const { data, error } = await supabase
        .from('facts_monthly_location')
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
        monthData.totalVolume += Number(row.total_volume);
        monthData.totalPayout += Number(row.mh_net_payout);
      });

      // Calculate net income
      const result = Array.from(monthMap.values()).map(monthData => ({
        ...monthData,
        netIncome: monthData.totalVolume - monthData.totalPayout
      }));

      return result;
    }
  });

  const formatCurrency = (amount: number) => formatMoneyExact(amount);

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

  const onExportAgentCsv = () => {
    const header = ['Location', 'Month', 'Volume', 'BPS', 'Agent Commission'];
    const lines = agentRows.map(r => [
      `"${r.location_name.replace(/"/g,'""')}"`,
      r.month_key,
      String(r.total_volume ?? 0),
      String(r.bps ?? 0),
      String(r.commission ?? 0),
    ].join(','));
    const csv = [header.join(','), ...lines, '', `Totals,,${agentTotals.volume},,${agentTotals.commission}`].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-report-${selectedAgent ?? 'unknown'}-${monthKey ?? 'month'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <TabsTrigger value="agent">Agent Reports</TabsTrigger>
          <TabsTrigger value="pl">P&L Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="commission" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="w-48">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="focus-brand">
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
                className="hover:bg-brand-50 hover:border-brand-200 focus-brand"
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
                  <TableHead>Agent/Company</TableHead>
                  <TableHead>Locations</TableHead>
                  <TableHead>Total Volume</TableHead>
                      <TableHead>MH Net Payout</TableHead>
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

        <TabsContent value="agent" className="space-y-6">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Month</label>
                <input
                  type="month"
                  value={agentReportMonth}
                  onChange={(e) => setAgentReportMonth(e.target.value)}
                  className="border border-border rounded px-3 py-2 bg-background focus-brand"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Agent</label>
                <Select value={selectedAgent ?? ''} onValueChange={(value) => setSelectedAgent(value || null)}>
                  <SelectTrigger className="min-w-[220px] focus-brand">
                    <SelectValue placeholder="Select agent…" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={onExportAgentCsv}
              disabled={!agentRows.length}
              variant="outline"
              className="hover:bg-brand-50 hover:border-brand-200 focus-brand disabled:hover:bg-background"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Agent Volume</div>
                <div className="text-2xl font-semibold">
                  {agentTotals.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Agent Commission</div>
                <div className="text-2xl font-semibold">
                  {agentTotals.commission.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Month</div>
                <div className="text-2xl font-semibold">{monthKey ?? '—'}</div>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Agent Commission Report - {monthKey ?? 'No Month Selected'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">BPS</TableHead>
                    <TableHead className="text-right">Agent Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentLoading && (
                    <TableRow>
                      <TableCell className="py-4 text-center text-muted-foreground" colSpan={4}>
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!agentLoading && !agentRows.length && (
                    <TableRow>
                      <TableCell className="py-4 text-center text-muted-foreground" colSpan={4}>
                        {!selectedAgent ? 'Select an agent to view commission data.' : 'No data available for the selected agent and month.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {agentRows.map(r => (
                    <TableRow key={r.location_id}>
                      <TableCell className="font-medium">{r.location_name}</TableCell>
                      <TableCell className="text-right">
                        {Number(r.total_volume).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{r.bps} BPS</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(r.commission).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {agentRows.length > 0 && (
                  <tfoot className="bg-muted/50 font-medium">
                    <TableRow>
                      <TableCell className="text-right">Totals</TableCell>
                      <TableCell className="text-right">
                        {agentTotals.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">
                        {agentTotals.commission.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                      </TableCell>
                    </TableRow>
                  </tfoot>
                )}
              </Table>

              {agentError && (
                <div className="mt-4 text-destructive text-sm">{agentError}</div>
              )}
            </CardContent>
          </Card>
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