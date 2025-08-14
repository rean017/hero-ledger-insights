import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface LocationData {
  location_id: string;
  location_name: string;
}

interface AgentTerm {
  term_id: string;
  agent_id: string;
  agent_name: string;
  bps: number;
}

interface Agent {
  id: string;
  name: string;
}

interface AssignAgentModalProps {
  open: boolean;
  onClose: () => void;
  location: LocationData;
  onUpdate: () => void;
}

export function AssignAgentModal({ open, onClose, location, onUpdate }: AssignAgentModalProps) {
  const [terms, setTerms] = useState<AgentTerm[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [bps, setBps] = useState<number>(75);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, location.location_id]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load existing terms
      const { data: termsData, error: termsError } = await supabase.rpc('mh_get_location_terms', {
        p_location_id: location.location_id
      });
      if (termsError) throw termsError;
      setTerms(termsData || []);

      // Load all agents
      const { data: agentsData, error: agentsError } = await supabase
        .from('agents')
        .select('id, name')
        .eq('active', true)
        .order('name');
      if (agentsError) throw agentsError;
      setAgents(agentsData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedAgentId) {
      toast({
        title: "Error",
        description: "Please select an agent",
        variant: "destructive",
      });
      return;
    }
    
    if (bps < 0 || bps > 1000) {
      toast({
        title: "Error", 
        description: "BPS must be between 0 and 1000",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc('mh_set_location_agent_term', {
        p_location_id: location.location_id,
        p_agent_id: selectedAgentId,
        p_bps: bps
      });
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Agent assignment saved",
      });
      
      // Refresh terms
      await loadData();
      setSelectedAgentId('');
      setBps(75);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (agentId: string, agentName: string) => {
    try {
      const { error } = await supabase.rpc('mh_remove_location_agent_term', {
        p_location_id: location.location_id,
        p_agent_id: agentId
      });
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Removed ${agentName} from ${location.location_name}`,
      });
      
      await loadData();
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const availableAgents = agents.filter(agent => 
    !terms.some(term => term.agent_id === agent.id)
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Agents to {location.location_name}</DialogTitle>
          <DialogDescription>
            Set commission rates (BPS) for agents at this location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add new agent assignment */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent">Select Agent</Label>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent..." />
                </SelectTrigger>
                <SelectContent>
                  {availableAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bps">Basis Points (BPS)</Label>
              <Input
                id="bps"
                type="number"
                min="0"
                max="1000"
                value={bps}
                onChange={(e) => setBps(parseInt(e.target.value) || 0)}
                placeholder="75"
              />
              <p className="text-sm text-muted-foreground">
                {bps} BPS = {(bps / 100).toFixed(2)}%
              </p>
            </div>

            <Button 
              onClick={handleSave} 
              disabled={saving || !selectedAgentId}
            >
              {saving ? 'Saving...' : 'Add Assignment'}
            </Button>
          </div>

          {/* Existing assignments */}
          {terms.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium">Current Assignments</h4>
              <div className="space-y-2">
                {terms.map((term) => (
                  <Card key={term.term_id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{term.agent_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {term.bps} BPS ({(term.bps / 100).toFixed(2)}%)
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(term.agent_id, term.agent_name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {loading && <p className="text-center text-muted-foreground">Loading...</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
