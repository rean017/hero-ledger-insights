
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

  // Fetch assignments for this location
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

  const handleAddAgent = async () => {
    if (!newAgent || !newRate) {
      toast({
        title: "Error",
        description: "Please select an agent and enter a BPS rate",
        variant: "destructive"
      });
      return;
    }

    // Check if agent is already assigned
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
        description: `${newAgent} assigned to ${locationName} with ${newRate} BPS`
      });

      setNewAgent("");
      setNewRate("");
      setIsEditing(false);
      refetch();
      onUpdate();
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['unified-locations'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
    } catch (error: any) {
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
        description: `Removed ${agent_name} from ${locationName}`
      });

      refetch();
      onUpdate();
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['unified-locations'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
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

  const availableAgents = agents?.filter(
    agent => !assignments?.some(a => a.agent_name === agent.name)
  ) || [];

  return (
    <div className="space-y-2">
      {/* Current Assignments */}
      {assignments?.map((assignment) => (
        <div key={assignment.id} className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {assignment.agent_name}
          </Badge>
          
          {editingAssignment === assignment.id ? (
            <div className="flex items-center gap-1">
              <Input
                value={editRate}
                onChange={(e) => setEditRate(e.target.value)}
                placeholder="BPS"
                className="w-16 h-6 text-xs"
                type="number"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => handleUpdateRate(assignment.id, assignment.agent_name)}
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
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
              <span className="text-xs text-muted-foreground">
                {Math.round(assignment.commission_rate * 100)} BPS
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => startEditing(assignment.id, assignment.commission_rate)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                onClick={() => handleRemoveAgent(assignment.id, assignment.agent_name)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      ))}

      {/* Add New Agent */}
      {isEditing ? (
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={newAgent} onValueChange={setNewAgent}>
            <SelectTrigger className="w-32 h-6 text-xs">
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
            className="w-16 h-6 text-xs"
            type="number"
          />
          
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleAddAgent}>
            <Check className="h-3 w-3" />
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
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
          className="h-6 w-6 p-0"
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
