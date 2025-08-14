import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, Plus, Edit, DollarSign, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Agent {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentStats {
  totalVolume: number;
  totalPayout: number;
  avgBPS: number;
  locationCount: number;
}

export const SimpleAgentManagement = () => {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentNotes, setAgentNotes] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch all agents
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch agent statistics from monthly_data
  const { data: agentStats = {} } = useQuery({
    queryKey: ['agent-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_data')
        .select('*');
      
      if (error) throw error;

      const stats: Record<string, AgentStats> = {};
      
      // Group by agent and calculate stats
      data.forEach(row => {
        if (!stats[row.agent_name]) {
          stats[row.agent_name] = {
            totalVolume: 0,
            totalPayout: 0,
            avgBPS: 0,
            locationCount: 0
          };
        }
        
        stats[row.agent_name].totalVolume += Number(row.volume);
        stats[row.agent_name].totalPayout += Number(row.agent_payout);
      });

      // Calculate average BPS and location counts
      Object.keys(stats).forEach(agentName => {
        const stat = stats[agentName];
        stat.avgBPS = stat.totalVolume > 0 ? (stat.totalPayout / stat.totalVolume) * 10000 : 0;
        
        // Count unique locations per agent
        const agentData = data.filter(row => row.agent_name === agentName);
        stat.locationCount = new Set(agentData.map(row => row.location_name)).size;
      });

      return stats;
    }
  });

  // Create/Update agent mutation using RPCs
  const agentMutation = useMutation({
    mutationFn: async (agentData: { name: string; notes: string }) => {
      if (selectedAgent) {
        // Update existing agent
        const { data, error } = await supabase.rpc('mh_update_agent', {
          p_id: selectedAgent.id,
          p_name: agentData.name,
          p_notes: agentData.notes || null,
          p_active: true
        });
        
        if (error) throw new Error(error.message);
        return data;
      } else {
        // Create new agent
        const { data, error } = await supabase.rpc('mh_create_agent', {
          p_name: agentData.name,
          p_notes: agentData.notes || null
        });
        
        if (error) throw new Error(error.message);
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setIsEditing(false);
      setSelectedAgent(null);
      setAgentName('');
      setAgentNotes('');
      toast({
        title: "Success",
        description: selectedAgent ? "Agent updated successfully" : "Agent created successfully"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save agent",
        variant: "destructive"
      });
    }
  });

  const handleEdit = (agent: Agent) => {
    setSelectedAgent(agent);
    setAgentName(agent.name);
    setAgentNotes(agent.notes || '');
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!agentName.trim()) {
      toast({
        title: "Validation Error",
        description: "Agent name is required",
        variant: "destructive"
      });
      return;
    }

    agentMutation.mutate({
      name: agentName.trim(),
      notes: agentNotes.trim()
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return <div>Loading agents...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agent Management</h1>
          <p className="text-muted-foreground">Manage agents and view their performance</p>
        </div>
        
        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setSelectedAgent(null);
              setAgentName('');
              setAgentNotes('');
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Agent
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedAgent ? 'Edit Agent' : 'Add New Agent'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Agent Name</label>
                <Input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Enter agent name"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Notes (Optional)</label>
                <Textarea
                  value={agentNotes}
                  onChange={(e) => setAgentNotes(e.target.value)}
                  placeholder="Add any notes about this agent"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={agentMutation.isPending}>
                  {agentMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Agents Found</h3>
            <p className="text-muted-foreground text-center">
              Upload monthly data or create agents manually to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Agents ({agents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent Name</TableHead>
                  <TableHead>Locations</TableHead>
                  <TableHead>Total Volume</TableHead>
                  <TableHead>Total Payout</TableHead>
                  <TableHead>Avg BPS</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => {
                  const stats = agentStats[agent.name] || {
                    totalVolume: 0,
                    totalPayout: 0,
                    avgBPS: 0,
                    locationCount: 0
                  };

                  return (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell>{stats.locationCount}</TableCell>
                      <TableCell>{formatCurrency(stats.totalVolume)}</TableCell>
                      <TableCell>{formatCurrency(stats.totalPayout)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {stats.avgBPS.toFixed(0)} BPS
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(agent)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};