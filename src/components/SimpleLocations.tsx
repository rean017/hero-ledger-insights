import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Search, RefreshCw, Bug } from 'lucide-react';
import MonthPicker from './MonthPicker';
import { fmtMonthLabel } from '../hooks/useAvailableMonths';

interface LocationData {
  location_id: string;
  location_name: string;
  total_volume: number;
  agent_net_payout: number;
  agent_count: number;
  is_zero_volume: boolean;
  margin_ratio: number;
  month: string;
}

export const SimpleLocations = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [hasAgentsFilter, setHasAgentsFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Get location data using the new RPC
  const { data: locationData = [], isLoading, refetch } = useQuery({
    queryKey: ['location-data-rpc', selectedMonth, searchTerm, hasAgentsFilter],
    queryFn: async (): Promise<LocationData[]> => {
      const agentFlag = hasAgentsFilter === 'yes' ? true : hasAgentsFilter === 'no' ? false : null;
      
      console.info('📍 [locations] load month=', selectedMonth, 'query=', searchTerm, 'hasAgents=', agentFlag);
      
      const { data, error } = await supabase.rpc('mh_get_locations', {
        p_month: selectedMonth || null,
        p_query: searchTerm || null,
        p_has_agents: agentFlag
      });

      if (error) {
        console.error('❌ [locations] rpc error:', error);
        throw error;
      }

      return data as LocationData[];
    },
    enabled: !!selectedMonth
  });

  // Diagnostics query
  const { data: diagnostics } = useQuery({
    queryKey: ['month-diagnostics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mh_diag_month_counts');
      if (error) throw error;
      return data as { month: string; rows: number }[];
    },
    enabled: showDiagnostics
  });

  // Manual refresh function
  const handleRefresh = () => {
    refetch();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const runDiagnostics = () => {
    setShowDiagnostics(true);
    console.info('🔍 [diagnostics] running month counts...');
  };

  const formatPercentage = (ratio: number) => {
    return `${(ratio * 100).toFixed(2)}%`;
  };

  const calculateBPS = (payout: number, volume: number) => {
    return volume > 0 ? (payout / volume) * 10000 : 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Locations</h1>
          <p className="text-muted-foreground">View location performance and agent assignments</p>
        </div>
        
        <div className="flex gap-2">
          <MonthPicker 
            value={selectedMonth} 
            onChange={setSelectedMonth}
            className="w-48 border rounded px-3 py-2 bg-background"
          />
          <Button onClick={runDiagnostics} variant="outline" size="sm">
            <Bug className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showDiagnostics && diagnostics && (
        <Card>
          <CardHeader>
            <CardTitle>📊 Month Diagnostics</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Row Count</TableHead>
                  <TableHead>Display Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnostics.map((diag) => (
                  <TableRow key={diag.month}>
                    <TableCell className="font-mono">{diag.month}</TableCell>
                    <TableCell>{diag.rows}</TableCell>
                    <TableCell>{fmtMonthLabel(diag.month)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selectedMonth && (
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRefresh()}
              className="pl-9"
            />
          </div>
          <Select value={hasAgentsFilter} onValueChange={(value: 'all' | 'yes' | 'no') => setHasAgentsFilter(value)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              <SelectItem value="yes">Has Agents</SelectItem>
              <SelectItem value="no">No Agents</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleRefresh} disabled={isLoading} variant="outline">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}

      {selectedMonth && locationData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Locations for {fmtMonthLabel(selectedMonth)} ({locationData.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location Name</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Agent Net Payout</TableHead>
                  <TableHead className="text-right">BPS</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead className="text-center"># Agents</TableHead>
                  <TableHead className="text-center">Zero Vol?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locationData.map((location) => {
                  const bps = calculateBPS(location.agent_net_payout, location.total_volume);

                  return (
                    <TableRow key={location.location_id}>
                      <TableCell className="font-medium">{location.location_name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(location.total_volume)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(location.agent_net_payout)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">
                          {bps.toFixed(0)} BPS
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatPercentage(location.margin_ratio)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={location.agent_count > 0 ? "default" : "secondary"}>
                          {location.agent_count}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {location.is_zero_volume && (
                          <Badge variant="destructive" className="text-xs">
                            ⚑
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {locationData.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No locations found matching your search criteria.
              </div>
            )}
          </CardContent>
        </Card>
      ) : selectedMonth ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Data Available</h3>
            <p className="text-muted-foreground text-center">
              No location data found for {fmtMonthLabel(selectedMonth)}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a Month</h3>
            <p className="text-muted-foreground text-center">
              Choose a month from the dropdown to view location data.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};