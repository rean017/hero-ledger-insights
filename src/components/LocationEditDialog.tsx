import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { convertToBPSDisplay, convertToDecimalRate } from "@/utils/bpsCalculations";

interface Location {
  id: string;
  name: string;
  account_id: string | null;
  account_type: string | null;
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

interface LocationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: Location | null;
  onLocationUpdated: () => void;
}

const LocationEditDialog = ({ open, onOpenChange, location, onLocationUpdated }: LocationEditDialogProps) => {
  const [locationName, setLocationName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountType, setAccountType] = useState("");
  const [assignments, setAssignments] = useState<LocationAssignment[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newAgent, setNewAgent] = useState("");
  const [newRate, setNewRate] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch agents on component mount and when dialog opens
  useEffect(() => {
    if (open) {
      fetchAgents();
      if (location) {
        setLocationName(location.name);
        setAccountId(location.account_id || "");
        setAccountType(location.account_type || "");
        fetchAssignments();
      }
    } else {
      // Reset form when dialog closes
      setLocationName("");
      setAccountId("");
      setAccountType("");
      setAssignments([]);
      setNewAgent("");
      setNewRate("");
    }
  }, [location, open]);

  const fetchAgents = async () => {
    setAgentsLoading(true);
    try {
      console.log('Fetching agents in LocationEditDialog...');
      
      const { data: agentsData, error: agentsError } = await supabase
        .from('agents')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (agentsError) {
        console.error('Error fetching from agents table:', agentsError);
      }

      const { data: transactionAgents, error: transactionError } = await supabase
        .from('transactions')
        .select('agent_name')
        .not('agent_name', 'is', null);

      if (transactionError) {
        console.error('Error fetching from transactions:', transactionError);
      }

      const allAgents = new Set<string>();
      
      agentsData?.forEach(agent => allAgents.add(agent.name));
      transactionAgents?.forEach(t => {
        if (t.agent_name) allAgents.add(t.agent_name);
      });

      const combinedAgents = Array.from(allAgents).map((name, index) => ({
        id: agentsData?.find(a => a.name === name)?.id || `transaction-${index}`,
        name
      }));

      console.log('Combined agents found in LocationEditDialog:', combinedAgents);
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

  const fetchAssignments = async () => {
    if (!location) return;

    try {
      const { data, error } = await supabase
        .from('location_agent_assignments')
        .select('*')
        .eq('location_id', location.id)
        .eq('is_active', true);

      if (error) throw error;
      setAssignments(data || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  const invalidateRelatedQueries = () => {
    // Invalidate ALL queries that depend on location assignments and P&L data
    queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
    queryClient.invalidateQueries({ queryKey: ['agent-location-pl-data'] });
    queryClient.invalidateQueries({ queryKey: ['period-summary'] });
    queryClient.invalidateQueries({ queryKey: ['agents-for-pl'] });
    queryClient.invalidateQueries({ queryKey: ['locations'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['top-agents'] });
    queryClient.invalidateQueries({ queryKey: ['agents-data'] });
    queryClient.invalidateQueries({ queryKey: ['agents'] });
    
    // Also trigger callbacks to refresh parent components
    onLocationUpdated();
  };

  const handleAddAgent = async () => {
    if (!newAgent || !newRate || !location) {
      toast({
        title: "Error",
        description: "Please select an agent and enter a BPS rate",
        variant: "destructive"
      });
      return;
    }

    if (assignments.some(a => a.agent_name === newAgent)) {
      toast({
        title: "Error",
        description: "Agent is already assigned to this location",
        variant: "destructive"
      });
      return;
    }

    // Convert BPS to proper decimal format for storage
    const bpsValue = parseFloat(newRate);
    const decimalRate = bpsValue / 10000; // Convert BPS to decimal (e.g., 75 BPS = 0.0075)

    try {
      const { data: existingAssignments, error: fetchError } = await supabase
        .from('location_agent_assignments')
        .select('*')
        .eq('location_id', location.id)
        .eq('agent_name', newAgent)
        .eq('is_active', false);

      if (fetchError) throw fetchError;

      if (existingAssignments && existingAssignments.length > 0) {
        const { error: updateError } = await supabase
          .from('location_agent_assignments')
          .update({
            commission_rate: decimalRate,
            is_active: true
          })
          .eq('id', existingAssignments[0].id);

        if (updateError) throw updateError;

        toast({
          title: "Success",
          description: `Agent assignment reactivated successfully with ${newRate} BPS rate`
        });
      } else {
        const { error: insertError } = await supabase
          .from('location_agent_assignments')
          .insert({
            location_id: location.id,
            agent_name: newAgent,
            commission_rate: decimalRate,
            is_active: true
          });

        if (insertError) throw insertError;

        toast({
          title: "Success",
          description: `Agent assigned successfully with ${newRate} BPS rate`
        });
      }

      setNewAgent("");
      setNewRate("");
      fetchAssignments();
      invalidateRelatedQueries();
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
        description: "Agent removed successfully - P&L calculations will be updated"
      });

      fetchAssignments();
      invalidateRelatedQueries();
    } catch (error: any) {
      console.error('Error removing agent:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove agent",
        variant: "destructive"
      });
    }
  };

  const handleSaveLocation = async () => {
    if (!location || !locationName.trim()) {
      toast({
        title: "Error",
        description: "Location name is required",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('locations')
        .update({
          name: locationName.trim(),
          account_id: accountId.trim() || null,
          account_type: accountType.trim() || null
        })
        .eq('id', location.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Location updated successfully - P&L data will refresh"
      });

      onLocationUpdated();
      invalidateRelatedQueries();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating location:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update location",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const availableAgentsForSelection = agents.filter(
    agent => !assignments.some(a => a.agent_name === agent.name)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Location</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Location Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Location Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location-name">Location Name</Label>
                <Input
                  id="location-name"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="Enter location name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="account-id">Account ID</Label>
                <Input
                  id="account-id"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="Enter account ID"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-type">Account Type</Label>
              <Input
                id="account-type"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                placeholder="Enter account type"
              />
            </div>
          </div>

          {/* Agent Assignments */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Agent Assignments</h3>
            
            {/* Add New Agent */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/50">
              <div className="space-y-2">
                <Label>Select Agent</Label>
                <Select value={newAgent} onValueChange={setNewAgent} disabled={agentsLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder={agentsLoading ? "Loading agents..." : "Select Agent"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgentsForSelection.length > 0 ? (
                      availableAgentsForSelection.map((agent) => (
                        <SelectItem key={agent.id} value={agent.name}>
                          {agent.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-agents-available" disabled>
                        {agentsLoading ? "Loading..." : "No available agents"}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {agents.length === 0 && !agentsLoading && (
                  <p className="text-sm text-muted-foreground">
                    No agents found. Add agents in Agent Management first.
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label>BPS Rate</Label>
                <Input
                  placeholder="BPS Rate (e.g., 75)"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  type="number"
                  step="1"
                />
              </div>
              
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <Button 
                  onClick={handleAddAgent} 
                  className="gap-2 w-full"
                  disabled={!newAgent || !newRate || agentsLoading || newAgent === "no-agents-available"}
                >
                  <Plus className="h-4 w-4" />
                  Add Agent
                </Button>
              </div>
            </div>

            {/* Current Assignments */}
            <div className="space-y-2">
              {assignments.length > 0 ? (
                assignments.map((assignment) => {
                  const displayBPS = convertToBPSDisplay(assignment.commission_rate);
                  
                  return (
                    <div key={assignment.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">
                          {assignment.agent_name}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {displayBPS} BPS
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAgent(assignment.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  No agents assigned to this location
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLocation} disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LocationEditDialog;
