import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, MapPin, Building2, Users, DollarSign, Edit3, Check, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LocationAgentInlineEdit from "./LocationAgentInlineEdit";
import { calculateLocationCommissions } from "@/utils/commissionCalculations";

interface LocationWithExtras {
  id: string;
  name: string;
  account_id?: string;
  account_type?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
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
  const { toast } = useToast();

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

  // Fetch locations with assignment data and commission calculations
  const { data: locations, isLoading, refetch } = useQuery({
    queryKey: ['unified-locations'],
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

      const { data: transactions, error: transactionError } = await supabase
        .from('transactions')
        .select('account_id, volume, debit_volume, agent_payout');

      if (transactionError) throw transactionError;

      // Calculate commissions for all locations
      const commissions = calculateLocationCommissions(transactions, assignments, locations);

      // Map locations with their assignment data and commission calculations
      return locations.map(location => {
        const locationAssignments = assignments.filter(a => a.location_id === location.id);
        const locationTransactions = transactions.filter(t => t.account_id === location.account_id);
        const locationCommissions = commissions.filter(c => c.locationId === location.id);
        
        const totalVolume = locationTransactions.reduce((sum, t) => {
          const volume = Number(t.volume) || 0;
          const debitVolume = Number(t.debit_volume) || 0;
          return sum + volume + debitVolume;
        }, 0);
        
        const totalCommission = locationTransactions.reduce((sum, t) => {
          const agentPayout = Number(t.agent_payout) || 0;
          return sum + agentPayout;
        }, 0);

        return {
          ...location,
          assignedAgents: locationAssignments.length,
          totalVolume,
          totalCommission,
          agentNames: locationAssignments.map(a => a.agent_name).join(', '),
          assignments: locationAssignments,
          commissions: locationCommissions
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
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search locations, accounts, or agents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
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
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Building2 className="h-5 w-5" />
                          {location.name}
                        </CardTitle>
                        <Badge variant="secondary">
                          {location.account_type || 'Unknown'}
                        </Badge>
                      </div>
                      {location.account_id && (
                        <p className="text-sm text-muted-foreground font-mono">
                          Account: {location.account_id}
                        </p>
                      )}
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

</edits_to_apply>
