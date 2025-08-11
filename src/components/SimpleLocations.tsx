import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MapPin, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface LocationData {
  location_name: string;
  total_volume: number;
  mh_net_payout: number;
  month: string;
}

export const SimpleLocations = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAgent, setFilterAgent] = useState<string>('');

  // Get available months from facts table
  const { data: availableMonths = [] } = useQuery({
    queryKey: ['available-months'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facts')
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

  // Get location data for selected month from facts table
  const { data: locationData = [], isLoading } = useQuery({
    queryKey: ['location-data', selectedMonth],
    queryFn: async (): Promise<LocationData[]> => {
      if (!selectedMonth) return [];

      const { data, error } = await supabase
        .from('facts')
        .select(`
          total_volume,
          mh_net_payout,
          month,
          locations (
            name
          )
        `)
        .eq('month', selectedMonth)
        .order('locations(name)');
      
      if (error) throw error;
      
      return data.map(item => ({
        location_name: item.locations?.name || '',
        total_volume: item.total_volume,
        mh_net_payout: item.mh_net_payout,
        month: item.month
      }));
    },
    enabled: !!selectedMonth
  });

  // Get unique agents for filter (simplified - just show "Merchant Hero")
  const uniqueAgents = ['Merchant Hero'];

  // Filter location data
  const filteredData = React.useMemo(() => {
    return locationData.filter(location => {
      const matchesSearch = searchTerm === '' || 
        location.location_name.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Since we only have Merchant Hero now, no agent filtering needed
      return matchesSearch;
    });
  }, [locationData, searchTerm]);

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
      </div>

      {selectedMonth && (
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      )}

      {selectedMonth && locationData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Locations for {formatMonthDisplay(selectedMonth)} ({filteredData.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location Name</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>MH Net Payout</TableHead>
                  <TableHead>Merchant Hero Payout</TableHead>
                  <TableHead>BPS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((location, index) => {
                  const merchantHeroPayout = location.total_volume - location.mh_net_payout;
                  const bps = calculateBPS(location.mh_net_payout, location.total_volume);

                  return (
                    <TableRow key={`${location.location_name}-${index}`}>
                      <TableCell className="font-medium">{location.location_name}</TableCell>
                      <TableCell>{formatCurrency(location.total_volume)}</TableCell>
                      <TableCell>{formatCurrency(location.mh_net_payout)}</TableCell>
                      <TableCell>{formatCurrency(merchantHeroPayout)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {bps.toFixed(0)} BPS
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {filteredData.length === 0 && (
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
              No location data found for {formatMonthDisplay(selectedMonth)}.
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