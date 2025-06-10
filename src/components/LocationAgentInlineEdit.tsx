import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface LocationAgentInlineEditProps {
  locationId: string;
  locationName: string;
  onUpdate: () => void;
}

interface Assignment {
  id: string;
  agent_name: string;
  commission_rate: number;
  is_active: boolean;
}

const LocationAgentInlineEdit = ({ locationId, locationName, onUpdate }: LocationAgentInlineEditProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newAgent, setNewAgent] = useState("");
  const [newRate, setNewRate] = useState("");
  const [editingAssignment, setEditingAssignment] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch agents
  const { data: agents } = useQuery({
    queryKey: ['agents-for-inline-edit'],
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

  // Fetch assignments for this location (including inactive ones to check for duplicates)
  const { data: assignments, refetch } = useQuery({
    queryKey: ['location-assignments', locationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('location_agent_assignments')
        .select('*')
        .eq('location_id', locationId)
        .eq('is_active', true);

      if (error) throw error;
      return data;
    }
  });

  // Fetch all assignments (including inactive) to check for existing records
  const { data: allAssignments } = useQuery({
    queryKey: ['all-location-assignments', locationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('location_agent_assignments')
        .select('*')
        .eq('location_id', locationId);

      if (error) throw error;
      return data;
    }
  });

  const handleAddAgent = async () => {
    if (!newAgent || !newRate) {
      toast({
        title: "Error",
        description: "Please select an agent and enter a BPS rate",
        variant: "destructive"
      });
      return;
    }

    // Check if agent is already active
    if (assignments?.some(a => a.agent_name === newAgent)) {
      toast({
        title: "Error",
        description: "Agent is already assigned to this location",
        variant: "destructive"
      });
      return;
    }

    const decimalRate = parseFloat(newRate) / 100; // Convert BPS to decimal

    try {
      // Check if there's an existing inactive assignment for this agent
      const existingAssignment = allAssignments?.find(
        a => a.agent_name === newAgent && !a.is_active
      );

      if (existingAssignment) {
        // Reactivate the existing assignment with new rate
        const { error } = await supabase
          .from('location_agent_assignments')
          .update({ 
            is_active: true,
            commission_rate: decimalRate
          })
          .eq('id', existingAssignment.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: `${newAgent} re-assigned with ${newRate} BPS`
        });
      } else {
        // Create new assignment
        const { error } = await supabase
          .from('location_agent_assignments')
          .insert({
            location_id: locationId,
            agent_name: newAgent,
            commission_rate: decimalRate,
            is_active: true
          });

        if (error) throw error;

        toast({
          title: "Success",
          description: `${newAgent} assigned with ${newRate} BPS`
        });
      }

      setNewAgent("");
      setNewRate("");
      setIsEditing(false);
      refetch();
      onUpdate();
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['unified-locations'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
      queryClient.invalidateQueries({ queryKey: ['all-location-assignments', locationId] });
    } catch (error: any) {
      console.error('Error assigning agent:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to assign agent",
        variant: "destructive"
      });
    }
  };

  const handleUpdateRate = async (assignmentId: string, agent_name: string) => {
    if (!editRate) return;

    const decimalRate = parseFloat(editRate) / 100;

    try {
      const { error } = await supabase
        .from('location_agent_assignments')
        .update({ commission_rate: decimalRate })
        .eq('id', assignmentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Updated ${agent_name} rate to ${editRate} BPS`
      });

      setEditingAssignment(null);
      setEditRate("");
      refetch();
      onUpdate();
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['unified-locations'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update rate",
        variant: "destructive"
      });
    }
  };

  const handleRemoveAgent = async (assignmentId: string, agent_name: string) => {
    try {
      const { error } = await supabase
        .from('location_agent_assignments')
        .update({ is_active: false })
        .eq('id', assignmentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Removed ${agent_name}`
      });

      refetch();
      onUpdate();
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['unified-locations'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
      queryClient.invalidateQueries({ queryKey: ['all-location-assignments', locationId] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove agent",
        variant: "destructive"
      });
    }
  };

  const startEditing = (assignmentId: string, currentRate: number) => {
    setEditingAssignment(assignmentId);
    setEditRate((currentRate * 100).toString()); // Convert decimal to BPS for display
  };

  // Filter available agents to exclude only those that are currently active
  // Also exclude Merchant Hero from manual assignment since they're auto-calculated
  const availableAgents = agents?.filter(
    agent => agent.name !== 'Merchant Hero' && !assignments?.some(a => a.agent_name === agent.name)
  ) || [];

  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      {/* Current Assignments */}
      {assignments?.map((assignment) => (
        <div key={assignment.id} className="group flex items-center justify-between bg-muted/30 rounded-md px-2 py-1 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {assignment.agent_name}
            </span>
            
            {editingAssignment === assignment.id ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editRate}
                  onChange={(e) => setEditRate(e.target.value)}
                  placeholder="BPS"
                  className="w-16 h-7 text-xs border-input"
                  type="number"
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 hover:bg-green-100 hover:text-green-700"
                  onClick={() => handleUpdateRate(assignment.id, assignment.agent_name)}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-700"
                  onClick={() => {
                    setEditingAssignment(null);
                    setEditRate("");
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground bg-background px-1 py-0.5 rounded border">
                  {assignment.agent_name === 'Merchant Hero'
                    ? 'Auto-Calculated'
                    : `${Math.round(assignment.commission_rate * 100)} BPS`}
                </span>
                {/* Don't allow editing Merchant Hero's rate since it's auto-calculated */}
                {assignment.agent_name !== 'Merchant Hero' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-100 hover:text-blue-700"
                    onClick={() => startEditing(assignment.id, assignment.commission_rate)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
                {/* Don't allow removing Merchant Hero since they should always be present */}
                {assignment.agent_name !== 'Merchant Hero' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-700"
                    onClick={() => handleRemoveAgent(assignment.id, assignment.agent_name)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Add New Agent */}
      {isEditing ? (
        <div className="flex items-center gap-1 bg-blue-50 rounded-md px-2 py-1 border border-blue-200">
          <Select value={newAgent} onValueChange={setNewAgent}>
            <SelectTrigger className="w-28 h-7 text-xs border-blue-300">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              {availableAgents.map((agent) => (
                <SelectItem key={agent.name} value={agent.name} className="text-xs">
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Input
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            placeholder="BPS"
            className="w-16 h-7 text-xs border-blue-300"
            type="number"
          />
          
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 w-7 p-0 hover:bg-green-100 hover:text-green-700" 
            onClick={handleAddAgent}
          >
            <Check className="h-3 w-3" />
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-700"
            onClick={() => {
              setIsEditing(false);
              setNewAgent("");
              setNewRate("");
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 self-start hover:bg-green-100 hover:text-green-700 transition-colors"
          onClick={() => setIsEditing(true)}
          disabled={availableAgents.length === 0}
        >
          <Plus className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

export default LocationAgentInlineEdit;
