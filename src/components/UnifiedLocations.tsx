import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Search, MapPin, Building2, Users, DollarSign, Edit3, Check, X, CalendarIcon, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LocationAgentInlineEdit from "./LocationAgentInlineEdit";
import { calculateLocationCommissions } from "@/utils/commissionCalculations";
import { getDynamicTimeFrames, getDateRangeForTimeFrame, normalizeCustomDateRange } from "@/utils/timeFrameUtils";
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
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState("");
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [tempLocationName, setTempLocationName] = useState("");
  const [tempAccountId, setTempAccountId] = useState("");
  
  // Get dynamic time frames and set default to April (first option) since that's what was uploaded
  const timeFrames = getDynamicTimeFrames();
  const [timeFrame, setTimeFrame] = useState(timeFrames[0].value); // April (first option)
  
  const { toast } = useToast();

  // Fetch monthly P&L data for the selected timeframe
  const { data: monthlyData } = useQuery({
    queryKey: ['monthly-pl-data', timeFrame, customDateRange],
    queryFn: async () => {
      if (!dateRange) {
        console.log('📊 UnifiedLocations: No date range available, skipping P&L data fetch');
        return [];
      }

      console.log('📊 UnifiedLocations: Fetching P&L data for date range:', dateRange);

      const { data, error } = await supabase
        .from('pl_data')
        .select('*')
        .gte('month', dateRange.fromFormatted)
        .lte('month', dateRange.toFormatted)
        .order('month');

      if (error) {
        console.error('📊 UnifiedLocations: Error fetching P&L data:', error);
        throw error;
      }

      console.log('📊 UnifiedLocations: P&L data fetched:', data?.length || 0, 'records');
      return data || [];
    },
    enabled: !!dateRange
  });

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

  // Debug: Log the timeframe and date range
  console.log('🗓️ UnifiedLocations: Current timeframe selected:', timeFrame);
  console.log('🗓️ UnifiedLocations: Date range for timeframe:', dateRange);
  console.log('🗓️ UnifiedLocations: Available timeframes:', timeFrames);
  console.log('🗓️ UnifiedLocations: Custom date range:', customDateRange);

  // Ensure Merchant Hero exists and assign to locations without assignments
  const ensureMerchantHeroSetup = async () => {
    try {
      // Ensure Merchant Hero exists
      const { data: existingMerchantHero, error: checkError } = await supabase
        .from('agents')
        .select('id')
        .eq('name', 'Merchant Hero')
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking for Merchant Hero:', checkError);
        return;
      }

      if (!existingMerchantHero) {
        console.log('Creating Merchant Hero agent...');
        const { error: insertError } = await supabase
          .from('agents')
          .insert([{ name: 'Merchant Hero', is_active: true }]);
        
        if (insertError) {
          console.error('Error creating Merchant Hero:', insertError);
          return;
        }
      }

      // Get all locations that don't have Merchant Hero assigned
      const { data: locationsWithoutMerchantHero, error: queryError } = await supabase
        .from('locations')
        .select(`
          id, 
          name,
          location_agent_assignments!inner(location_id)
        `)
        .not('location_agent_assignments.agent_name', 'eq', 'Merchant Hero')
        .eq('location_agent_assignments.is_active', true);

      if (queryError) {
        console.error('Error querying locations:', queryError);
        return;
      }

      // Also get locations with no assignments at all
      const { data: locationsWithNoAssignments, error: noAssignError } = await supabase
        .from('locations')
        .select('id, name')
        .not('id', 'in', 
          supabase
            .from('location_agent_assignments')
            .select('location_id')
            .eq('is_active', true)
        );

      if (noAssignError) {
        console.error('Error querying locations with no assignments:', noAssignError);
        return;
      }

      // Combine both sets of locations that need Merchant Hero
      const allLocationsNeedingMerchantHero = [
        ...(locationsWithoutMerchantHero || []),
        ...(locationsWithNoAssignments || [])
      ];

      // Remove duplicates based on id
      const uniqueLocations = allLocationsNeedingMerchantHero.filter(
        (location, index, self) => self.findIndex(l => l.id === location.id) === index
      );

      if (uniqueLocations.length > 0) {
        console.log(`Assigning Merchant Hero to ${uniqueLocations.length} locations...`);
        
        // Create assignments in batch
        const assignments = uniqueLocations.map(location => ({
          location_id: location.id,
          agent_name: 'Merchant Hero',
          commission_rate: 0, // 0 BPS since they get the remainder
          is_active: true
        }));

        const { error: batchInsertError } = await supabase
          .from('location_agent_assignments')
          .insert(assignments);

        if (batchInsertError) {
          console.error('Error batch inserting Merchant Hero assignments:', batchInsertError);
        } else {
          console.log('Successfully assigned Merchant Hero to all locations');
        }
      }
    } catch (error) {
      console.error('Error in ensureMerchantHeroSetup:', error);
    }
  };

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

  const handleToggleFranchise = async (location: LocationWithExtras) => {
    try {
      const newFranchiseStatus = !location.is_franchise;
      
      const { error } = await supabase
        .from('locations')
        .update({ is_franchise: newFranchiseStatus })
        .eq('id', location.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Location ${newFranchiseStatus ? 'marked as' : 'unmarked as'} franchise`,
      });

      refetch();
    } catch (error: any) {
      console.error('Error toggling franchise status:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update franchise status",
        variant: "destructive"
      });
    }
  };

  const handleEditLocation = async (locationId: string, name: string, accountId: string) => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ 
          name: name.trim(),
          account_id: accountId.trim()
        })
        .eq('id', locationId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Location updated successfully"
      });

      setEditingLocation(null);
      setTempLocationName("");
      setTempAccountId("");
      refetch();
    } catch (error: any) {
      console.error('Error updating location:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update location",
        variant: "destructive"
      });
    }
  };

  const startEditingLocation = (location: LocationWithExtras) => {
    setEditingLocation(location.id);
    setTempLocationName(location.name);
    setTempAccountId(location.account_id || "");
  };

  const cancelEditingLocation = () => {
    setEditingLocation(null);
    setTempLocationName("");
    setTempAccountId("");
  };

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
    }
  });

  const handleNotesUpdate = async (locationId: string, notes: string) => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ notes })
        .eq('id', locationId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Notes updated successfully"
      });

      setEditingNotes(null);
      setTempNotes("");
      refetch();
    } catch (error: any) {
      console.error('Error updating notes:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update notes",
        variant: "destructive"
      });
    }
  };

  const startEditingNotes = (locationId: string, currentNotes: string) => {
    setEditingNotes(locationId);
    setTempNotes(currentNotes || "");
  };

  const cancelEditingNotes = () => {
    setEditingNotes(null);
    setTempNotes("");
  };

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

  const AgentAssignmentDisplay = ({ location }: { location: LocationWithExtras }) => {
    const { assignments = [], commissions = [], totalCommission = 0 } = location;
    
    // Sort assignments to show Merchant Hero first
    const sortedAssignments = [...assignments].sort((a, b) => {
      if (a.agent_name === 'Merchant Hero') return -1;
      if (b.agent_name === 'Merchant Hero') return 1;
      return a.agent_name.localeCompare(b.agent_name);
    });

    return (
      <div className="space-y-3">
        {sortedAssignments.map((assignment) => {
          const commission = commissions.find(c => c.agentName === assignment.agent_name);
          const earnings = assignment.agent_name === 'Merchant Hero' 
            ? commission?.merchantHeroPayout || 0
            : commission?.agentPayout || 0;
          
          // For Merchant Hero, show auto-calculated BPS; for others, show their set rate
          const bpsDisplay = assignment.agent_name === 'Merchant Hero'
            ? `${commission?.bpsRate || 0} BPS (Auto)`
            : `${Math.round(assignment.commission_rate * 100)} BPS`;

          return (
            <div key={assignment.id} className="bg-muted/30 rounded-lg p-3">
              <div className="font-medium text-foreground mb-1">
                {assignment.agent_name} – {bpsDisplay}
              </div>
              <div className="text-emerald-600 font-semibold">
                Earnings: ${earnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          );
        })}
        
        {assignments.length === 0 && (
          <div className="text-sm text-muted-foreground">No agents assigned</div>
        )}
        
        <div className="pt-3 border-t border-muted">
          <div className="text-sm text-muted-foreground mb-1">Total Net Payout:</div>
          <div className="font-semibold text-emerald-600">
            ${totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    );
  };

  const filteredLocations = locations?.filter(location =>
    location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.account_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.agentNames?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Locations & Accounts</h2>
          <p className="text-muted-foreground">Manage locations, accounts, and agent assignments</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading locations...</p>
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
              📊 Showing estimated monthly volume data for {timeFrame.toUpperCase()}
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Total Locations
              </span>
              <span className="font-semibold">{locations?.length || 0}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Assigned Locations
              </span>
              <span className="font-semibold">
                {locations?.filter(l => l.assignedAgents > 0).length || 0}
              </span>
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
              <span className="font-semibold">
                ${(locations?.reduce((sum, l) => sum + (l.totalVolume || 0), 0) || 0).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Total Commission
              </span>
              <span className="font-semibold">
                ${(locations?.reduce((sum, l) => sum + (l.totalCommission || 0), 0) || 0).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

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
              {filteredLocations.map((location, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        {editingLocation === location.id ? (
                          <div className="flex-1 space-y-2 pr-2">
                            <Input
                              value={tempLocationName}
                              onChange={(e) => setTempLocationName(e.target.value)}
                              placeholder="Location name"
                              className="font-semibold"
                            />
                            <Input
                              value={tempAccountId}
                              onChange={(e) => setTempAccountId(e.target.value)}
                              placeholder="Account ID"
                              className="text-sm font-mono"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleEditLocation(location.id, tempLocationName, tempAccountId)}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEditingLocation}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-1 flex-1">
                              <CardTitle className="flex items-center gap-2 text-lg">
                                <Building2 className="h-5 w-5" />
                                {location.name}
                                {location.is_franchise && (
                                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                                    <Building2 className="h-3 w-3 mr-1" />
                                    Franchise
                                  </Badge>
                                )}
                              </CardTitle>
                              {location.account_id && (
                                <p className="text-sm text-muted-foreground font-mono">
                                  Account: {location.account_id}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant={location.is_franchise ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleToggleFranchise(location)}
                                className={`flex-shrink-0 ${location.is_franchise ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                                title="Toggle franchise status"
                              >
                                <Building2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditingLocation(location)}
                                className="flex-shrink-0"
                                title="Edit location"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        )}
                        <Badge variant="secondary">
                          {location.account_type || 'Unknown'}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Volume</span>
                      <span className="font-semibold text-emerald-600">
                        ${(location.totalVolume || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    
                    <div>
                      <div className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Assigned Agents ({location.assignedAgents || 0})
                      </div>
                      <LocationAgentInlineEdit 
                        locationId={location.id}
                        locationName={location.name}
                        onUpdate={refetch}
                      />
                    </div>

                    <div>
                      <AgentAssignmentDisplay location={location} />
                    </div>

                    {/* Notes Section */}
                    <div className="pt-3 border-t border-muted">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Notes</span>
                        {editingNotes !== location.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => startEditingNotes(location.id, location.notes || "")}
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      
                      {editingNotes === location.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={tempNotes}
                            onChange={(e) => setTempNotes(e.target.value)}
                            placeholder="Add notes..."
                            className="min-h-[60px] text-sm"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => handleNotesUpdate(location.id, tempNotes)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={cancelEditingNotes}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground min-h-[40px] p-2 bg-muted/20 rounded border">
                          {location.notes || "No notes added"}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
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
