import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateLocationCommissions, groupCommissionsByAgent } from "@/utils/commissionCalculations";

const AgentManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const { toast } = useToast();

  const { data: agents, isLoading, refetch } = useQuery({
    queryKey: ['agents-data'],
    queryFn: async () => {
      console.log('Fetching agents data for AgentManagement...');
      
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('agent_name, volume, debit_volume, account_id')
        .not('agent_name', 'is', null);

      if (error) throw error;

      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          is_active
        `)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('id, name, account_id');

      if (locationError) throw locationError;

      // Use the standardized commission calculation
      const commissions = calculateLocationCommissions(transactions || [], assignments || [], locations || []);
      const agentSummaries = groupCommissionsByAgent(commissions);

      console.log('Commission calculations for agents:', agentSummaries);

      // Calculate total revenue and account counts for each agent
      const agentStats = transactions?.reduce((acc, t) => {
        const name = t.agent_name!;
        if (!acc[name]) {
          acc[name] = { 
            name, 
            totalRevenue: 0, 
            accountsCount: new Set(),
            status: 'active'
          };
        }
        acc[name].totalRevenue += (t.volume || 0) + (t.debit_volume || 0);
        
        if (t.account_id) {
          acc[name].accountsCount.add(t.account_id);
        }
        
        return acc;
      }, {} as Record<string, any>) || {};

      // Get manual agents from database
      const { data: manualAgents, error: manualError } = await supabase
        .from('agents')
        .select('name, is_active');

      if (manualError) {
        console.error('Error fetching manual agents:', manualError);
        throw manualError;
      }

      console.log('Manual agents from database:', manualAgents);

      // Add manual agents that don't have transaction data
      manualAgents?.forEach(agent => {
        if (!agentStats[agent.name]) {
          agentStats[agent.name] = {
            name: agent.name,
            totalRevenue: 0,
            accountsCount: 0,
            status: agent.is_active ? 'active' : 'inactive'
          };
        } else {
          agentStats[agent.name].status = agent.is_active ? 'active' : 'inactive';
        }
      });

      // Merge commission data with agent stats
      const result = Object.values(agentStats).map(agent => {
        const agentCommissionSummary = agentSummaries.find(summary => summary.agentName === agent.name);
        const totalCommission = agentCommissionSummary ? agentCommissionSummary.totalCommission : 0;
        
        return {
          ...agent,
          accountsCount: typeof agent.accountsCount === 'object' ? agent.accountsCount.size : agent.accountsCount,
          totalCommission,
          avgRate: agent.totalRevenue > 0 ? ((totalCommission / agent.totalRevenue) * 100).toFixed(2) + '%' : '0%'
        };
      });

      console.log('Final agents data:', result);
      return result;
    }
  });

  const handleAddAgent = async () => {
    if (!newAgentName.trim()) {
      toast({
        title: "Error",
        description: "Please enter an agent name",
        variant: "destructive"
      });
      return;
    }

    try {
      console.log('Adding new agent:', newAgentName.trim());
      const { error } = await supabase
        .from('agents')
        .insert([{ name: newAgentName.trim(), is_active: true }]);

      if (error) {
        console.error('Error inserting agent:', error);
        throw error;
      }

      toast({
        title: "Success",
        description: `Agent "${newAgentName}" has been added successfully`
      });

      setNewAgentName("");
      setIsDialogOpen(false);
      refetch();
    } catch (error: any) {
      console.error('Error adding agent:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add agent. Please try again.",
        variant: "destructive"
      });
    }
  };

  const filteredAgents = agents?.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Agent Management</h2>
          <p className="text-muted-foreground">Manage agent information and commission rates</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading agent data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Agent Management</h2>
          <p className="text-muted-foreground">Manage agent information and commission rates</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Agent
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Agent</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="agentName">Agent Name</Label>
                <Input
                  id="agentName"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="Enter agent name"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddAgent}>
                  Add Agent
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>All Agents</CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAgents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-muted-foreground">Agent</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Avg Rate</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Accounts</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Total Volume</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Calculated Commission</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <div>
                          <p className="font-medium">{agent.name}</p>
                        </div>
                      </td>
                      <td className="p-4 font-semibold">{agent.avgRate}</td>
                      <td className="p-4">{agent.accountsCount}</td>
                      <td className="p-4 font-semibold text-emerald-600">${agent.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 font-semibold text-emerald-600">${agent.totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4">
                        <Badge variant="default">
                          {agent.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No agents found. Add an agent or upload transaction data to see agents.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentManagement;
