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
import MonthPicker from './MonthPicker';
import { useAgentSummary } from '@/hooks/useAgentSummary';
import { formatMoneyExact, formatBpsExact } from '@/lib/numberFormat';

interface Agent {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const SimpleAgentManagement = () => {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentNotes, setAgentNotes] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
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

  // Fetch agent statistics using the new RPC
  const { data: agentStats, loading: statsLoading, error: statsError } = useAgentSummary(selectedMonth);

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


  if (isLoading || statsLoading) {
    return <div>Loading agents...</div>;
  }

  if (statsError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Error loading agent statistics: {statsError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agent Management</h1>
          <p className="text-muted-foreground">Manage agents and view their performance</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Month:</label>
            <MonthPicker
              value={selectedMonth}
              onChange={setSelectedMonth}
              className="w-40"
            />
          </div>
          
          <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogTrigger asChild>
            <Button 
              className="bg-brand-500 hover:bg-brand-600 text-white focus-brand"
              onClick={() => {
                setSelectedAgent(null);
                setAgentName('');
                setAgentNotes('');
              }}
            >
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
                  className="focus-brand"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Notes (Optional)</label>
                <Textarea
                  value={agentNotes}
                  onChange={(e) => setAgentNotes(e.target.value)}
                  placeholder="Add any notes about this agent"
                  rows={3}
                  className="focus-brand"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={handleSave} 
                  disabled={agentMutation.isPending}
                  className="bg-brand-500 hover:bg-brand-600 text-white focus-brand"
                >
                  {agentMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)} className="hover:bg-brand-50 hover:border-brand-200 focus-brand">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
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
                  const stats = agentStats?.find(s => s.agent_id === agent.id) || {
                    location_count: 0,
                    total_volume: 0,
                    total_payout: 0,
                    avg_bps: 0
                  };

                  return (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell>{stats.location_count}</TableCell>
                      <TableCell>{formatMoneyExact(Number(stats.total_volume))}</TableCell>
                      <TableCell>{formatMoneyExact(Number(stats.total_payout))}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {formatBpsExact(Number(stats.avg_bps))}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(agent)}
                          className="hover:bg-brand-50 hover:border-brand-200 focus-brand"
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