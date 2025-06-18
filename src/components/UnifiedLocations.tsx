import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Search, CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getDynamicTimeFrames, getDateRangeForTimeFrame, normalizeCustomDateRange } from "@/utils/timeFrameUtils";
import { ensureMerchantHeroSetup } from "@/utils/locationOperations";
import { useMonthlyData } from "@/hooks/useMonthlyData";
import LocationSummaryCards from "./LocationSummaryCards";
import LocationCard from "./LocationCard";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface LocationWithExtras {
  id: string;
  name: string;
  account_id?: string;
  account_type?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  is_franchise?: boolean;
  assignedAgents: number;
  totalVolume: number;
  totalCommission: number;
  agentNames: string;
  assignments: any[];
  commissions: any[];
}

const UnifiedLocations = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  
  // Get dynamic time frames and set default to April (first option) since that's what was uploaded
  const timeFrames = getDynamicTimeFrames();
  const [timeFrame, setTimeFrame] = useState(timeFrames[0].value); // April (first option)
  
  const { toast } = useToast();

  // Get date range - use custom if selected and available, otherwise use timeframe
  const dateRange = React.useMemo(() => {
    if (timeFrame === 'custom' && customDateRange) {
      // Validate that both dates exist and are valid before normalizing
      if (customDateRange.from && customDateRange.to && 
          customDateRange.from instanceof Date && customDateRange.to instanceof Date &&
          !isNaN(customDateRange.from.getTime()) && !isNaN(customDateRange.to.getTime())) {
        try {
          return normalizeCustomDateRange(customDateRange);
        } catch (error) {
          console.error('Error normalizing custom date range:', error);
          return null;
        }
      }
      return null;
    }
    return getDateRangeForTimeFrame(timeFrame);
  }, [timeFrame, customDateRange]);

  // Fetch monthly P&L data for the selected timeframe
  const { data: monthlyData, isLoading: isMonthlyDataLoading } = useMonthlyData(timeFrame, customDateRange, dateRange);

  // Debug: Log the timeframe and date range
  console.log('🗓️ UnifiedLocations: Current timeframe selected:', timeFrame);
  console.log('🗓️ UnifiedLocations: Date range for timeframe:', dateRange);
  console.log('🗓️ UnifiedLocations: Available timeframes:', timeFrames);
  console.log('🗓️ UnifiedLocations: Custom date range:', customDateRange);
  console.log('📊 UnifiedLocations: Monthly data loading:', isMonthlyDataLoading);
  console.log('📊 UnifiedLocations: Monthly data result:', monthlyData);

  // Run Merchant Hero setup on component mount
  useEffect(() => {
    ensureMerchantHeroSetup();
  }, []);

  // Fetch available agents
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data;
    }
  });

  const handleAddLocation = async () => {
    if (!newLocationName.trim() || !newAccountId.trim()) {
      toast({
        title: "Error",
        description: "Please enter both location name and account ID",
        variant: "destructive"
      });
      return;
    }

    try {
      // Insert the new location
      const { data: location, error: locationError } = await supabase
        .from('locations')
        .insert([{ 
          name: newLocationName.trim(), 
          account_id: newAccountId.trim()
        }])
        .select()
        .single();

      if (locationError) throw locationError;

      // Always assign Merchant Hero to every location with 0 BPS (since they auto-calculate)
      const { error: merchantHeroError } = await supabase
        .from('location_agent_assignments')
        .insert([{
          location_id: location.id,
          agent_name: 'Merchant Hero',
          commission_rate: 0, // 0 BPS since they auto-calculate
          is_active: true
        }]);

      if (merchantHeroError) throw merchantHeroError;

      // If an agent and commission rate are selected, create assignment
      if (selectedAgent && commissionRate) {
        const { error: assignmentError } = await supabase
          .from('location_agent_assignments')
          .insert([{
            location_id: location.id,
            agent_name: selectedAgent,
            commission_rate: parseFloat(commissionRate) / 100, // Convert BPS to decimal
            is_active: true
          }]);

        if (assignmentError) throw assignmentError;
      }

      toast({
        title: "Success",
        description: `Location "${newLocationName}" has been added successfully with Merchant Hero automatically assigned`
      });

      setNewLocationName("");
      setNewAccountId("");
      setSelectedAgent("");
      setCommissionRate("");
      setIsDialogOpen(false);
      refetch();
    } catch (error: any) {
      console.error('Error adding location:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add location. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Fetch locations with assignment data and use monthly volume data
  const { data: locations, isLoading, refetch } = useQuery({
    queryKey: ['unified-locations', timeFrame, customDateRange],
    queryFn: async () => {
      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('*')
        .order('name');

      if (locationError) throw locationError;

      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select('*')
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      console.log('🏢 UnifiedLocations: Processing locations with monthly volume data...');
      console.log('📊 UnifiedLocations: Available monthly data:', monthlyData?.length || 0, 'records');

      // Calculate total monthly volume from P&L data for the timeframe
      const totalMonthlyVolume = monthlyData?.reduce((sum, plData) => {
        const volume = Number(plData.total_volume) || 0;
        const debitVolume = Number(plData.total_debit_volume) || 0;
        return sum + volume + debitVolume;
      }, 0) || 0;

      const totalMonthlyAgentPayouts = monthlyData?.reduce((sum, plData) => {
        const payouts = Number(plData.total_agent_payouts) || 0;
        return sum + payouts;
      }, 0) || 0;

      console.log('📊 UnifiedLocations: Total monthly volume:', totalMonthlyVolume.toLocaleString());
      console.log('📊 UnifiedLocations: Total monthly agent payouts:', totalMonthlyAgentPayouts.toLocaleString());

      // For now, since we don't have location-specific monthly data,
      // we'll distribute the total monthly volume across locations with assignments
      const locationsWithAssignments = locations.filter(location => 
        assignments.some(a => a.location_id === location.id)
      );

      const volumePerLocation = locationsWithAssignments.length > 0 
        ? totalMonthlyVolume / locationsWithAssignments.length 
        : 0;

      const payoutPerLocation = locationsWithAssignments.length > 0 
        ? totalMonthlyAgentPayouts / locationsWithAssignments.length 
        : 0;

      console.log('📊 UnifiedLocations: Volume per location (estimated):', volumePerLocation.toLocaleString());
      console.log('📊 UnifiedLocations: Payout per location (estimated):', payoutPerLocation.toLocaleString());

      // Map locations with their assignment data and estimated monthly volume
      return locations.map(location => {
        const locationAssignments = assignments.filter(a => a.location_id === location.id);
        
        // Use estimated volume for locations with assignments, 0 for others
        const totalVolume = locationAssignments.length > 0 ? volumePerLocation : 0;
        const totalCommission = locationAssignments.length > 0 ? payoutPerLocation : 0;

        console.log(`🏢 UnifiedLocations: Location ${location.name} - Volume: $${totalVolume.toLocaleString()}, Commission: $${totalCommission.toLocaleString()}`);

        return {
          ...location,
          assignedAgents: locationAssignments.length,
          totalVolume,
          totalCommission,
          agentNames: locationAssignments.map(a => a.agent_name).join(', '),
          assignments: locationAssignments,
          commissions: [] // We'll calculate these separately if needed
        } as LocationWithExtras;
      });
    },
    enabled: !isMonthlyDataLoading // Wait for monthly data to load first
  });

  const handleTimeFrameChange = (value: string) => {
    setTimeFrame(value);
    if (value !== 'custom') {
      setCustomDateRange(undefined);
    }
  };

  const handleCustomDateSelect = (range: { from: Date; to: Date } | undefined) => {
    console.log('📅 Custom date range selected:', range);
    setCustomDateRange(range);
    if (range?.from && range?.to) {
      setIsCalendarOpen(false);
    }
  };

  const filteredLocations = locations?.filter(location =>
    location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.account_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.agentNames?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (isLoading || isMonthlyDataLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Locations & Accounts</h2>
          <p className="text-muted-foreground">Manage locations, accounts, and agent assignments</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading locations and data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Locations & Accounts</h2>
          <p className="text-muted-foreground">Manage locations, accounts, and agent assignments</p>
          {monthlyData && monthlyData.length > 0 && (
            <p className="text-sm text-emerald-600 mt-1">
              📊 Showing monthly volume data for {timeFrame.toUpperCase()} ({monthlyData.length} records)
            </p>
          )}
          {(!monthlyData || monthlyData.length === 0) && (
            <p className="text-sm text-orange-600 mt-1">
              ⚠️ No monthly volume data found for {timeFrame.toUpperCase()}
            </p>
          )}
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Location</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="locationName">Location Name</Label>
                <Input
                  id="locationName"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="Enter location name"
                />
              </div>
              <div>
                <Label htmlFor="accountId">Account ID</Label>
                <Input
                  id="accountId"
                  value={newAccountId}
                  onChange={(e) => setNewAccountId(e.target.value)}
                  placeholder="Enter account ID"
                />
              </div>
              <div>
                <Label htmlFor="agent">Assign Agent (Optional)</Label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents?.map((agent) => (
                      <SelectItem key={agent.name} value={agent.name}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedAgent && (
                <div>
                  <Label htmlFor="commissionRate">Commission Rate (BPS)</Label>
                  <Input
                    id="commissionRate"
                    type="number"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    placeholder="Enter BPS rate (e.g., 75 for 0.75%)"
                  />
                </div>
              )}
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddLocation}>
                  Add Location
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <LocationSummaryCards locations={locations} />

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>All Locations</CardTitle>
            <div className="flex gap-4 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search locations, accounts, or agents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <ToggleGroup 
                  type="single" 
                  value={timeFrame} 
                  onValueChange={handleTimeFrameChange} 
                  className="grid grid-cols-2 lg:grid-cols-4 bg-muted rounded-lg p-1 w-full sm:w-auto"
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
                          "justify-start text-left font-normal",
                          !customDateRange && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customDateRange?.from && customDateRange?.to ? (
                          `${format(customDateRange.from, "MMM d")} - ${format(customDateRange.to, "MMM d")}`
                        ) : (
                          "Pick dates"
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
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLocations.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredLocations.map((location) => (
                <LocationCard 
                  key={location.id} 
                  location={location} 
                  onUpdate={refetch} 
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No locations found. Add a location to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UnifiedLocations;
