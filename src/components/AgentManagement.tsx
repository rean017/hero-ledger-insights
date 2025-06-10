import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, Search, Edit2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateLocationCommissions, groupCommissionsByAgent } from "@/utils/commissionCalculations";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

const AgentManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditNotesOpen, setIsEditNotesOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [agentNotes, setAgentNotes] = useState("");
  const [timeFrame, setTimeFrame] = useState("current");
  const { toast } = useToast();

  // Calculate date range based on timeFrame
  const getDateRange = (frame: string) => {
    const now = new Date();
    switch (frame) {
      case 'current':
        return {
          from: startOfMonth(now),
          to: endOfMonth(now)
        };
      case 'last':
        return {
          from: startOfMonth(subMonths(now, 1)),
          to: endOfMonth(subMonths(now, 1))
        };
      case 'last3':
        return {
          from: startOfMonth(subMonths(now, 2)),
          to: endOfMonth(now)
        };
      case 'all':
        return {
          from: new Date('2020-01-01'),
          to: new Date('2030-12-31')
        };
      default:
        return {
          from: startOfMonth(now),
          to: endOfMonth(now)
        };
    }
  };

  const dateRange = getDateRange(timeFrame);

  const { data: agents, isLoading, refetch } = useQuery({
    queryKey: ['agents-data', timeFrame, dateRange],
    queryFn: async () => {
      console.log('Fetching agents data for timeframe:', timeFrame, 'with date range:', dateRange);
      
      // Ensure Merchant Hero exists in agents table
      const { data: existingMerchantHero } = await supabase
        .from('agents')
        .select('id')
        .eq('name', 'Merchant Hero')
        .single();

      if (!existingMerchantHero) {
        console.log('Creating Merchant Hero agent...');
        await supabase
          .from('agents')
          .insert([{ name: 'Merchant Hero', is_active: true }]);
      }
      
      // Fetch ALL transactions first to see what data exists
      const { data: allTransactions, error: allTransactionError } = await supabase
        .from('transactions')
        .select('agent_name, volume, debit_volume, account_id, agent_payout, transaction_date')
        .not('agent_name', 'is', null);

      if (allTransactionError) {
        console.error('Error fetching all transactions:', allTransactionError);
        throw allTransactionError;
      }

      console.log('Total transactions in database:', allTransactions?.length || 0);
      console.log('Sample transaction dates:', allTransactions?.slice(0, 5).map(t => t.transaction_date));

      // Now filter by date range - if timeframe is 'all', don't filter by date
      let transactions = allTransactions || [];
      if (timeFrame !== 'all') {
        transactions = transactions.filter(t => {
          if (!t.transaction_date) return false;
          const transactionDate = new Date(t.transaction_date);
          return transactionDate >= dateRange.from && transactionDate <= dateRange.to;
        });
      }

      console.log(`Filtered transactions for ${timeFrame}:`, transactions.length);

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

      const { data: manualAgents, error: manualError } = await supabase
        .from('agents')
        .select('name, is_active, notes')
        .eq('is_active', true);

      if (manualError) {
        console.error('Error fetching manual agents:', manualError);
        throw manualError;
      }

      console.log('Raw data loaded:', {
        transactions: transactions?.length,
        assignments: assignments?.length,
        locations: locations?.length,
        manualAgents: manualAgents?.length,
        dateRange,
        timeFrame
      });

      // Use the standardized commission calculation
      const commissions = calculateLocationCommissions(transactions || [], assignments || [], locations || []);
      const agentCommissionSummaries = groupCommissionsByAgent(commissions);

      console.log('Commission summaries for timeframe:', agentCommissionSummaries);

      // Get all unique agent names from both manual agents and assignments
      const allAgentNames = new Set<string>();
      
      // Add agents from manual agents table
      manualAgents?.forEach(agent => {
        if (agent.name && agent.is_active) {
          allAgentNames.add(agent.name);
        }
      });

      // Add agents from assignments (in case they're not in manual table)
      assignments?.forEach(a => {
        if (a.agent_name && a.is_active) {
          allAgentNames.add(a.agent_name);
        }
      });

      console.log('All agent names:', Array.from(allAgentNames));

      // Build final agent data
      const result = Array.from(allAgentNames).map(agentName => {
        const commissionSummary = agentCommissionSummaries.find(summary => summary.agentName === agentName);
        const manualAgent = manualAgents?.find(a => a.name === agentName);
        
        // Count unique locations assigned to this agent
        const assignedLocations = assignments?.filter(a => a.agent_name === agentName && a.is_active) || [];
        const locationsCount = assignedLocations.length;
        
        // Get account IDs for locations assigned to this agent
        const assignedLocationIds = new Set(assignedLocations.map(a => a.location_id));
        const assignedAccountIds = new Set<string>();
        
        locations?.forEach(location => {
          if (assignedLocationIds.has(location.id) && location.account_id) {
            assignedAccountIds.add(location.account_id);
          }
        });

        console.log(`Agent ${agentName} assigned account IDs:`, Array.from(assignedAccountIds));

        // Calculate volume ONLY for assigned locations/accounts within date range
        const agentVolumeStats = transactions?.reduce((acc, t) => {
          // Only include transactions from accounts that correspond to assigned locations
          if (t.account_id && assignedAccountIds.has(t.account_id)) {
            const totalTransactionVolume = (Number(t.volume) || 0) + (Number(t.debit_volume) || 0);
            acc.totalVolume += totalTransactionVolume;
            acc.accountIds.add(t.account_id);
            console.log(`Adding transaction for ${agentName}: account ${t.account_id}, volume: ${t.volume}, debit: ${t.debit_volume}, total: ${totalTransactionVolume}, date: ${t.transaction_date}`);
          }
          return acc;
        }, { totalVolume: 0, accountIds: new Set<string>() }) || { totalVolume: 0, accountIds: new Set<string>() };

        const accountsCount = agentVolumeStats.accountIds.size;
        
        // Get total commission from commission calculations
        const totalCommission = commissionSummary ? commissionSummary.totalCommission : 0;
        
        // Calculate average rate as percentage of commission to volume
        let avgRate;
        if (agentName === 'Merchant Hero') {
          avgRate = 'Remainder';
        } else {
          avgRate = agentVolumeStats.totalVolume > 0 
            ? ((totalCommission / agentVolumeStats.totalVolume) * 100).toFixed(2) + '%' 
            : '0%';
        }

        const agentData = {
          name: agentName,
          totalRevenue: agentVolumeStats.totalVolume,
          accountsCount,
          locationsCount,
          totalCommission,
          avgRate,
          status: manualAgent ? (manualAgent.is_active ? 'active' : 'inactive') : 'active',
          notes: manualAgent?.notes || ''
        };

        console.log(`Final agent ${agentName} data for timeframe ${timeFrame}:`, {
          ...agentData,
          assignedLocationIds: Array.from(assignedLocationIds),
          assignedAccountIds: Array.from(assignedAccountIds),
          commissionSummary
        });
        return agentData;
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

  const handleUpdateNotes = async () => {
    if (!selectedAgent) return;

    try {
      const { error } = await supabase
        .from('agents')
        .update({ notes: agentNotes })
        .eq('name', selectedAgent.name);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Agent notes updated successfully"
      });

      setIsEditNotesOpen(false);
      setSelectedAgent(null);
      setAgentNotes("");
      refetch();
    } catch (error: any) {
      console.error('Error updating notes:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update notes. Please try again.",
        variant: "destructive"
      });
    }
  };

  const openEditNotes = (agent: any) => {
    setSelectedAgent(agent);
    setAgentNotes(agent.notes || '');
    setIsEditNotesOpen(true);
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h3 className="text-xl font-semibold">All Agents</h3>
        <div className="flex gap-4 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <ToggleGroup 
            type="single" 
            value={timeFrame} 
            onValueChange={setTimeFrame} 
            className="bg-muted rounded-lg p-1"
          >
            <ToggleGroupItem 
              value="current" 
              className="px-4 py-2 text-sm font-medium rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              Current Month
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="last" 
              className="px-4 py-2 text-sm font-medium rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              Last Month
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="last3" 
              className="px-4 py-2 text-sm font-medium rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              Last 3 Months
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="all" 
              className="px-4 py-2 text-sm font-medium rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              All Time
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {filteredAgents.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    <Badge variant="default" className="mt-2">
                      {agent.status}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditNotes(agent)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Rate</p>
                    <p className="font-semibold">{agent.avgRate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Locations</p>
                    <p className="font-semibold">{agent.locationsCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Accounts</p>
                    <p className="font-semibold">{agent.accountsCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Commission</p>
                    <p className="font-semibold text-emerald-600">${agent.totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Total Volume</p>
                  <p className="font-semibold text-emerald-600">${agent.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>

                {agent.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="text-sm bg-muted p-2 rounded-md mt-1">{agent.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-32">
          <p className="text-muted-foreground">No agents found. Add an agent to get started.</p>
        </div>
      )}

      <Dialog open={isEditNotesOpen} onOpenChange={setIsEditNotesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Notes for {selectedAgent?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="agentNotes">Notes</Label>
              <Textarea
                id="agentNotes"
                value={agentNotes}
                onChange={(e) => setAgentNotes(e.target.value)}
                placeholder="Enter notes for this agent..."
                rows={4}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsEditNotesOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateNotes}>
                Save Notes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgentManagement;
