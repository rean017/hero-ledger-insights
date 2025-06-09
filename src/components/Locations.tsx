import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Search, MapPin, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import LocationEditDialog from "./LocationEditDialog";

interface Location {
  id: string;
  name: string;
  account_id: string | null;
  account_type: string | null;
  created_at: string;
}

interface LocationAssignment {
  id: string;
  location_id: string;
  agent_name: string;
  commission_rate: number;
  is_active: boolean;
}

interface Agent {
  id: string;
  name: string;
}

const Locations = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [assignments, setAssignments] = useState<LocationAssignment[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [commissionRate, setCommissionRate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [locationToEdit, setLocationToEdit] = useState<Location | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchLocations();
    fetchAssignments();
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setAgentsLoading(true);
    try {
      console.log('Fetching agents in Locations component...');
      
      // First try to get agents from the agents table
      const { data: agentsData, error: agentsError } = await supabase
        .from('agents')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (agentsError) {
        console.error('Error fetching from agents table:', agentsError);
      }

      // Also get unique agent names from transactions as fallback
      const { data: transactionAgents, error: transactionError } = await supabase
        .from('transactions')
        .select('agent_name')
        .not('agent_name', 'is', null);

      if (transactionError) {
        console.error('Error fetching from transactions:', transactionError);
      }

      // Combine both sources
      const allAgents = new Set<string>();
      
      // Add agents from agents table
      agentsData?.forEach(agent => allAgents.add(agent.name));
      
      // Add agents from transactions
      transactionAgents?.forEach(t => {
        if (t.agent_name) allAgents.add(t.agent_name);
      });

      // Convert to agent objects
      const combinedAgents = Array.from(allAgents).map((name, index) => ({
        id: agentsData?.find(a => a.name === name)?.id || `transaction-${index}`,
        name
      }));

      console.log('Combined agents found:', combinedAgents);
      setAgents(combinedAgents);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast({
        title: "Error",
        description: "Failed to load agents",
        variant: "destructive"
      });
    } finally {
      setAgentsLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('name');

      if (error) throw error;
      setLocations(data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
      toast({
        title: "Error",
        description: "Failed to load locations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from('location_agent_assignments')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      setAssignments(data || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  const handleAssignAgent = async () => {
    if (!selectedLocation || !selectedAgent || !commissionRate) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    // Check if agent is already assigned and active to this location
    const existingActiveAssignment = assignments.find(
      a => a.location_id === selectedLocation && a.agent_name === selectedAgent
    );

    if (existingActiveAssignment) {
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

      // Reset form and refresh data
      setSelectedLocation("");
      setSelectedAgent("");
      setCommissionRate("");
      fetchAssignments();
    } catch (error: any) {
      console.error('Error assigning agent:', error);
      toast({
        title: "Error", 
        description: error.message || "Failed to assign agent",
        variant: "destructive"
      });
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('location_agent_assignments')
        .update({ is_active: false })
        .eq('id', assignmentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Assignment removed successfully"
      });

      fetchAssignments();
    } catch (error: any) {
      console.error('Error removing assignment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove assignment", 
        variant: "destructive"
      });
    }
  };

  const handleEditLocation = (location: Location) => {
    setLocationToEdit(location);
    setEditDialogOpen(true);
  };

  const handleLocationUpdated = () => {
    fetchLocations();
    fetchAssignments();
  };

  const filteredLocations = locations.filter(location =>
    location.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLocationAssignments = (locationId: string) => {
    return assignments.filter(assignment => assignment.location_id === locationId);
  };

  // Get available agents for the assignment dropdown (not already assigned to selected location)
  const getAvailableAgentsForLocation = () => {
    if (!selectedLocation) return agents;
    
    const locationAssignments = getLocationAssignments(selectedLocation);
    return agents.filter(agent => 
      !locationAssignments.some(assignment => assignment.agent_name === agent.name)
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Locations</h2>
          <p className="text-muted-foreground">Manage locations and agent assignments</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-4 w-4" />
              Assign Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger>
                <SelectValue placeholder="Select Location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedAgent} onValueChange={setSelectedAgent} disabled={agentsLoading}>
              <SelectTrigger>
                <SelectValue placeholder={agentsLoading ? "Loading agents..." : "Select Agent"} />
              </SelectTrigger>
              <SelectContent>
                {getAvailableAgentsForLocation().length > 0 ? (
                  getAvailableAgentsForLocation().map((agent) => (
                    <SelectItem key={agent.id} value={agent.name}>
                      {agent.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-agents-available" disabled>
                    {agentsLoading ? "Loading..." : selectedLocation ? "No available agents for this location" : "Select a location first"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {agents.length === 0 && !agentsLoading && (
              <p className="text-sm text-muted-foreground">
                No agents found. Add agents in Agent Management first.
              </p>
            )}
            <Input 
              placeholder="BPS Rate (e.g., 7500)" 
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              type="number"
              step="1"
            />
            <Button 
              onClick={handleAssignAgent} 
              className="w-full"
              disabled={!selectedLocation || !selectedAgent || !commissionRate || agentsLoading || selectedAgent === "no-agents-available"}
            >
              Assign Agent
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Locations</span>
              <span className="font-semibold">{locations.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">With Agents</span>
              <span className="font-semibold">
                {locations.filter(loc => getLocationAssignments(loc.id).length > 0).length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unassigned</span>
              <span className="font-semibold text-orange-600">
                {locations.filter(loc => getLocationAssignments(loc.id).length === 0).length}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Assignment Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Assignments</span>
              <span className="font-semibold">{assignments.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg. Rate</span>
              <span className="font-semibold">
                {assignments.length > 0 
                  ? `${Math.round(assignments.reduce((sum, a) => sum + a.commission_rate, 0) / assignments.length * 10000)} BPS`
                  : '0 BPS'
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Agents</span>
              <span className="font-semibold">
                {new Set(assignments.map(a => a.agent_name)).size}
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
                placeholder="Search locations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location Name</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Assigned Agents</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLocations.map((location) => {
                const locationAssignments = getLocationAssignments(location.id);
                return (
                  <TableRow key={location.id}>
                    <TableCell className="font-medium">{location.name}</TableCell>
                    <TableCell>{location.account_id || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{location.account_type || 'Unknown'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {locationAssignments.length > 0 ? (
                          locationAssignments.map((assignment) => (
                            <div key={assignment.id} className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-xs">
                                {assignment.agent_name} ({Math.round(assignment.commission_rate * 10000)} BPS)
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveAssignment(assignment.id)}
                                className="h-4 w-4 p-0 text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-sm">No agents assigned</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2"
                        onClick={() => handleEditLocation(location)}
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LocationEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        location={locationToEdit}
        onLocationUpdated={handleLocationUpdated}
      />
    </div>
  );
};

export default Locations;
