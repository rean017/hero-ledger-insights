

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Search, Users, DollarSign, TrendingUp, CalendarIcon, Plus } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LocationAgentInlineEdit from "./LocationAgentInlineEdit";
import { getDynamicTimeFrames, getDateRangeForTimeFrame } from "@/utils/timeFrameUtils";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

const UnifiedLocations = () => {
  // Get dynamic time frames and set default to April (2nd option - index 1)
  const timeFrames = getDynamicTimeFrames();
  const [timeFrame, setTimeFrame] = useState('apr'); // Default to April
  const [searchTerm, setSearchTerm] = useState("");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Get date range based on timeframe selection
  const getEffectiveDateRange = () => {
    if (timeFrame === 'custom' && customDateRange?.from && customDateRange?.to) {
      return {
        from: new Date(Date.UTC(
          customDateRange.from.getFullYear(), 
          customDateRange.from.getMonth(), 
          customDateRange.from.getDate()
        )),
        to: new Date(Date.UTC(
          customDateRange.to.getFullYear(), 
          customDateRange.to.getMonth(), 
          customDateRange.to.getDate(), 
          23, 59, 59, 999
        ))
      };
    }
    return getDateRangeForTimeFrame(timeFrame);
  };

  const dateRange = getEffectiveDateRange();

  // Fetch unified locations data
  const { data: locations = [] } = useQuery({
    queryKey: ['unified-locations'],
    queryFn: async () => {
      console.log('🔄 UnifiedLocations: Fetching unified locations data...');
      
      const { data, error } = await supabase
        .from('locations')
        .select(`
          *,
          location_agent_assignments!inner(
            id,
            agent_name,
            commission_rate,
            is_active
          )
        `)
        .eq('location_agent_assignments.is_active', true);

      if (error) throw error;
      console.log('📍 UnifiedLocations: Unified locations fetched:', data?.length || 0);
      return data;
    }
  });

  // Fetch agent assignments
  const { data: assignments = [] } = useQuery({
    queryKey: ['location_agent_assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('location_agent_assignments')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      return data;
    }
  });

  // Fetch all transactions
  const { data: allTransactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      console.log('🔄 UnifiedLocations: Fetching ALL transactions...');
      const { data, error } = await supabase
        .from('transactions')
        .select('*');

      if (error) throw error;
      
      console.log('📊 UnifiedLocations: Total transactions fetched:', data?.length || 0);
      return data;
    }
  });

  // Apply date filtering with detailed logging
  const filteredTransactions = dateRange 
    ? allTransactions.filter(t => {
        if (!t.transaction_date) return false;
        
        // Parse transaction date using same logic as other components
        const transactionDate = new Date(t.transaction_date + 'T00:00:00.000Z'); // Force UTC to avoid timezone issues
        
        // Ensure the transaction date is valid
        if (isNaN(transactionDate.getTime())) {
          console.log('⚠️ UnifiedLocations: Invalid transaction date:', t.transaction_date);
          return false;
        }
        
        const isInRange = transactionDate >= dateRange.from && transactionDate <= dateRange.to;
        
        if (isInRange) {
          console.log('✅ UnifiedLocations: Transaction date in range:', {
            transactionDate: transactionDate.toISOString(),
            fromDate: dateRange.from.toISOString(),
            toDate: dateRange.to.toISOString(),
            accountId: t.account_id,
            timeFrame: timeFrame
          });
        }
        
        return isInRange;
      })
    : allTransactions;

  console.log('📅 UnifiedLocations: Date filtering for timeframe:', timeFrame);
  console.log('📅 UnifiedLocations: Date range:', dateRange);
  console.log('📅 UnifiedLocations: Original transactions:', allTransactions.length);
  console.log('📅 UnifiedLocations: Filtered transactions:', filteredTransactions.length);

  // Calculate location data with commission details
  const locationData = locations.map(location => {
    const locationTransactions = filteredTransactions.filter(t => t.account_id === location.account_id);
    const totalVolume = locationTransactions.reduce((sum, t) => sum + (t.volume || 0), 0);
    
    // Get agents for this location
    const locationAssignments = assignments.filter(a => a.location_id === location.id);
    
    // Calculate commissions
    const netAgentPayout = totalVolume * 0.15; // 15% of volume as per your calculation
    let totalAgentPayouts = 0;
    
    const agentCommissions = locationAssignments
      .filter(a => a.agent_name !== 'Merchant Hero') // Regular agents first
      .map(assignment => {
        const commission = netAgentPayout * assignment.commission_rate;
        totalAgentPayouts += commission;
        return {
          agentName: assignment.agent_name,
          rate: assignment.commission_rate,
          commission: commission,
          bps: Math.round(assignment.commission_rate * 100)
        };
      });
    
    // Merchant Hero gets the remainder
    const merchantHeroCommission = netAgentPayout - totalAgentPayouts;
    const merchantHeroBPS = netAgentPayout > 0 ? Math.round((merchantHeroCommission / netAgentPayout) * 100) : 0;
    
    return {
      ...location,
      totalVolume,
      netAgentPayout,
      agentCommissions,
      merchantHeroCommission,
      merchantHeroBPS,
      transactionCount: locationTransactions.length
    };
  });

  // Filter based on search term
  const filteredLocations = locationData.filter(location =>
    location.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.account_id?.includes(searchTerm) ||
    location.location_agent_assignments?.some((assignment: any) =>
      assignment.agent_name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Calculate totals
  const totalVolume = filteredLocations.reduce((sum, l) => sum + l.totalVolume, 0);
  const totalCommissions = filteredLocations.reduce((sum, l) => sum + l.netAgentPayout, 0);
  const totalLocations = filteredLocations.length;

  const refetchData = () => {
    // This will be called when assignments are updated
  };

  const handleTimeFrameChange = (value: string) => {
    setTimeFrame(value);
    if (value !== 'custom') {
      setCustomDateRange(undefined);
      setIsCalendarOpen(false);
    }
  };

  const handleCustomDateSelect = (range: DateRange | undefined) => {
    setCustomDateRange(range);
    if (range?.from && range?.to) {
      setIsCalendarOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">All Locations</h2>
          <p className="text-muted-foreground">Manage locations, agents, and track commissions</p>
        </div>
        
        <div className="flex items-center gap-4">
          <ToggleGroup 
            type="single" 
            value={timeFrame} 
            onValueChange={handleTimeFrameChange}
            className="grid grid-cols-2 lg:grid-cols-4 bg-muted rounded-lg p-1"
          >
            {timeFrames.map((frame) => (
              <ToggleGroupItem 
                key={frame.value}
                value={frame.value} 
                className="px-3 py-2 text-xs lg:text-sm font-medium rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
              >
                {frame.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {timeFrame === 'custom' && (
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !customDateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {customDateRange?.from ? (
                    customDateRange.to ? (
                      <>
                        {format(customDateRange.from, "LLL dd, y")} -{" "}
                        {format(customDateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(customDateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={customDateRange?.from}
                  selected={customDateRange}
                  onSelect={handleCustomDateSelect}
                  numberOfMonths={2}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Total Locations
              </span>
              <span className="font-semibold">{totalLocations}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Volume
              </span>
              <span className="font-semibold">${totalVolume.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total Commissions
              </span>
              <span className="font-semibold">${totalCommissions.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search locations, accounts, or agents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Locations Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Locations & Agent Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLocations.map((location) => (
              <Card key={location.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {/* Location Header */}
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold text-lg">{location.name}</h3>
                        <Badge variant="secondary">
                          {location.account_type || 'Business'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground font-mono">
                        {location.account_id}
                      </p>
                    </div>

                    {/* Volume Information */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Total Volume</span>
                        <span className="font-semibold text-green-600">
                          ${location.totalVolume.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Transactions</span>
                        <span className="text-xs text-muted-foreground">
                          {location.transactionCount}
                        </span>
                      </div>
                    </div>

                    {/* Agent Assignment */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Assigned Agents</span>
                      </div>
                      <LocationAgentInlineEdit
                        locationId={location.id}
                        locationName={location.name}
                        onUpdate={refetchData}
                      />
                    </div>

                    {/* Merchant Hero Commission */}
                    <div className="pt-2 border-t space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Merchant Hero Commission</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {location.merchantHeroBPS} BPS (Auto-Calculated)
                      </div>
                      <div className="text-green-600 font-medium">
                        Earnings: ${location.merchantHeroCommission.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {filteredLocations.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'No locations match your search criteria.' : 'No locations found. Upload transaction data to get started.'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UnifiedLocations;

