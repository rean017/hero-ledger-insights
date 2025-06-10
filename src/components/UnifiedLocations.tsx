import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MapPin, Building2, Users, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LocationAgentInlineEdit from "./LocationAgentInlineEdit";

const UnifiedLocations = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newAccountId, setNewAccountId] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
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

  // Fetch locations with assignment data
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

      // Calculate stats for each location
      return locations.map(location => {
        const locationAssignments = assignments.filter(a => a.location_id === location.id);
        const locationTransactions = transactions.filter(t => t.account_id === location.account_id);
        
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
          agentNames: locationAssignments.map(a => a.agent_name).join(', ')
        };
      });
    }
  });

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

      // Always assign Merchant Hero to every location with 0 BPS (since they get the remainder)
      const { error: merchantHeroError } = await supabase
        .from('location_agent_assignments')
        .insert([{
          location_id: location.id,
          agent_name: 'Merchant Hero',
          commission_rate: 0, // 0 BPS since they get the remainder
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
            commission_rate: parseFloat(commissionRate) / 10000, // Convert BPS to decimal
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-muted-foreground">Location Name</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Account ID</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Assigned Agents</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Total Volume</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Commission Earned</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Account Type</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLocations.map((location, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <div>
                          <p className="font-medium">{location.name}</p>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-sm">{location.account_id || 'N/A'}</td>
                      <td className="p-4">
                        <LocationAgentInlineEdit
                          locationId={location.id}
                          locationName={location.name}
                          onUpdate={refetch}
                        />
                      </td>
                      <td className="p-4 font-semibold text-emerald-600">
                        ${(location.totalVolume || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 font-semibold text-emerald-600">
                        ${(location.totalCommission || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4">
                        <Badge variant="secondary">
                          {location.account_type || 'Unknown'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
