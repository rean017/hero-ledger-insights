import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Edit, MapPin, Building2, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import LocationEditDialog from "./LocationEditDialog";
import { convertToBPSDisplay, convertToDecimalRate } from "@/utils/bpsCalculations";

interface Location {
  id: string;
  name: string;
  account_id: string | null;
  account_type: string | null;
}

interface Agent {
  id: string;
  name: string;
}

interface LocationAssignment {
  id: string;
  location_id: string;
  agent_name: string;
  commission_rate: number;
  is_active: boolean;
}

const Locations = () => {
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedLocationForEdit, setSelectedLocationForEdit] = useState<Location | null>(null);
  const { toast } = useToast();

  const { data: locations, refetch: refetchLocations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
    }
  });

  const { data: agents } = useQuery({
    queryKey: ['agents'],
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

  const { data: assignments, refetch: refetchAssignments } = useQuery({
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

  const handleAssignAgent = async () => {
    if (!selectedAgent || !commissionRate || !selectedLocation) {
      toast({
        title: "Error",
        description: "Please select an agent, location, and enter a BPS rate",
        variant: "destructive"
      });
      return;
    }

    // Check if agent is already assigned and active to this location
    if (assignments?.some(a => a.location_id === selectedLocation && a.agent_name === selectedAgent && a.is_active)) {
      toast({
        title: "Error",
        description: "Agent is already assigned to this location",
        variant: "destructive"
      });
      return;
    }

    const rate = parseFloat(commissionRate) / 10000; // Convert BPS to decimal (divide by 10,000)

    try {
      // First check if there's an existing inactive assignment for this agent and location
      const { data: existingAssignments, error: fetchError } = await supabase
        .from('location_agent_assignments')
        .select('*')
        .eq('location_id', selectedLocation)
        .eq('agent_name', selectedAgent)
        .eq('is_active', false);

      if (fetchError) throw fetchError;

      if (existingAssignments && existingAssignments.length > 0) {
        // Reactivate the existing assignment with the new rate
        const { error: updateError } = await supabase
          .from('location_agent_assignments')
          .update({
            commission_rate: rate,
            is_active: true
          })
          .eq('id', existingAssignments[0].id);

        if (updateError) throw updateError;

        toast({
          title: "Success",
          description: "Agent assignment reactivated successfully"
        });
      } else {
        // Create new assignment
        const { error: insertError } = await supabase
          .from('location_agent_assignments')
          .insert({
            location_id: selectedLocation,
            agent_name: selectedAgent,
            commission_rate: rate,
            is_active: true
          });

        if (insertError) throw insertError;

        toast({
          title: "Success",
          description: "Agent assigned successfully"
        });
      }

      setSelectedAgent("");
      setCommissionRate("");
      setSelectedLocation("");
      refetchAssignments();
    } catch (error: any) {
      console.error('Error assigning agent:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to assign agent",
        variant: "destructive"
      });
    }
  };

  const handleRemoveAgent = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('location_agent_assignments')
        .update({ is_active: false })
        .eq('id', assignmentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Agent removed successfully"
      });

      refetchAssignments();
    } catch (error: any) {
      console.error('Error removing agent:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove agent",
        variant: "destructive"
      });
    }
  };

  const handleEditLocation = (location: Location) => {
    setSelectedLocationForEdit(location);
    setEditDialogOpen(true);
  };

  const locationAssignmentGroups = assignments?.reduce((groups, assignment) => {
    const { location_id } = assignment;
    if (!groups[location_id]) {
      groups[location_id] = [];
    }
    groups[location_id].push(assignment);
    return groups;
  }, {} as Record<string, LocationAssignment[]>) || {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Location Management</h2>
        <p className="text-muted-foreground">Manage locations and assign agents with commission rates</p>
      </div>

      {/* Quick Agent Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Quick Agent Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Select Agent" />
              </SelectTrigger>
              <SelectContent>
                {agents?.map((agent) => (
                  <SelectItem key={agent.id} value={agent.name}>
                    {agent.name}
                  </SelectItem>
                )) || []}
              </SelectContent>
            </Select>
            
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger>
                <SelectValue placeholder="Select Location" />
              </SelectTrigger>
              <SelectContent>
                {locations?.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                )) || []}
              </SelectContent>
            </Select>
            
            {agents && agents.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full">
                No agents found. Add agents in Agent Management first.
              </p>
            )}
            <Input 
              placeholder="BPS Rate (e.g., 75)" 
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              type="number"
              step="1"
            />
            <Button 
              onClick={handleAssignAgent} 
              className="gap-2"
              disabled={!selectedAgent || !selectedLocation || !commissionRate}
            >
              <Plus className="h-4 w-4" />
              Assign Agent
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Locations</span>
              <span className="font-semibold">{locations?.length || 0}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Active Assignments</span>
              <span className="font-semibold">{assignments?.length || 0}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Unique Agents</span>
              <span className="font-semibold">
                {new Set(assignments?.map(a => a.agent_name)).size || 0}
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Avg. Rate</span>
              <span className="font-semibold">
                {assignments && assignments.length > 0 
                  ? `${Math.round(assignments.reduce((sum, a) => sum + convertToBPSDisplay(a.commission_rate), 0) / assignments.length)} BPS`
                  : '0 BPS'
                }
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Locations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {locations?.map((location) => {
          const locationAssignments = locationAssignmentGroups[location.id] || [];
          
          return (
            <Card key={location.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Building2 className="h-5 w-5" />
                      {location.name}
                    </CardTitle>
                    {location.account_id && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Account: {location.account_id}
                      </p>
                    )}
                    {location.account_type && (
                      <p className="text-xs text-muted-foreground">
                        Type: {location.account_type}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditLocation(location)}
                    className="flex-shrink-0"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Agents ({locationAssignments.length})
                    </span>
                  </div>
                  
                  {locationAssignments.length > 0 ? (
                    <div className="space-y-2">
                      {locationAssignments.map((assignment) => (
                        <div key={assignment.id} className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-xs">
                            {assignment.agent_name} ({convertToBPSDisplay(assignment.commission_rate)} BPS)
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAgent(assignment.id)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No agents assigned</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {locations?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-32">
            <p className="text-muted-foreground">No locations found. Upload transaction data to see locations.</p>
          </CardContent>
        </Card>
      )}

      <LocationEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        location={selectedLocationForEdit}
        onLocationUpdated={() => {
          refetchLocations();
          refetchAssignments();
        }}
      />
    </div>
  );
};

export default Locations;
