
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Edit2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateLocationCommissions, groupCommissionsByAgent } from "@/utils/commissionCalculations";
import { getDynamicTimeFrames, getDateRangeForTimeFrame, getDefaultTimeFrame } from "@/utils/timeFrameUtils";

const AgentManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditNotesOpen, setIsEditNotesOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [agentNotes, setAgentNotes] = useState("");
  const [timeFrames, setTimeFrames] = useState<any[]>([]);
  const [timeFrame, setTimeFrame] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | null>(null);
  
  const { toast } = useToast();

  // Initialize timeframes and default timeframe
  useEffect(() => {
    const initializeTimeFrames = async () => {
      try {
        const frames = await getDynamicTimeFrames();
        const defaultFrame = await getDefaultTimeFrame();
        
        setTimeFrames(frames);
        setTimeFrame(defaultFrame);
        
        // Get date range for the default timeframe
        const range = await getDateRangeForTimeFrame(defaultFrame);
        setDateRange(range);
      } catch (error) {
        console.error('Error initializing timeframes:', error);
        // Fallback to April 2025 if there's an error
        setTimeFrame("2025-04");
        setDateRange({
          from: new Date("2025-04-01T00:00:00.000Z"),
          to: new Date("2025-04-30T23:59:59.999Z")
        });
      }
    };

    initializeTimeFrames();
  }, []);

  // Update date range when timeframe changes
  useEffect(() => {
    const updateDateRange = async () => {
      if (timeFrame) {
        try {
          const range = await getDateRangeForTimeFrame(timeFrame);
          setDateRange(range);
        } catch (error) {
          console.error('Error updating date range:', error);
        }
      }
    };

    updateDateRange();
  }, [timeFrame]);

  // Fetch transactions
  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      console.log('🔄 Fetching ALL transactions for Agent Management...');
      const { data, error } = await supabase
        .from('transactions')
        .select('*');

      if (error) {
        console.error('❌ Error fetching transactions:', error);
        throw error;
      }
      
      console.log('📊 Total transactions fetched:', data?.length || 0);
      return data || [];
    }
  });

  // Fetch assignments
  const { data: assignments = [] } = useQuery({
    queryKey: ['location_agent_assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('location_agent_assignments')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      console.log('📋 Assignments fetched:', data?.length || 0);
      return data || [];
    }
  });

  // Fetch locations
  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*');

      if (error) throw error;
      console.log('📍 Locations fetched:', data?.length || 0);
      return data || [];
    }
  });

  // Fetch manual agents
  const { data: manualAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('name, is_active, notes')
        .eq('is_active', true);

      if (error) throw error;
      console.log('👥 Manual agents fetched:', data?.length || 0);
      return data || [];
    }
  });

  // Apply date filtering FIRST, then calculate commissions with filtered data
  const filteredTransactions = dateRange 
    ? transactions.filter(t => {
        if (!t.transaction_date) return false;
        
        // CONSISTENT: Use same date parsing logic as other components
        const transactionDate = new Date(t.transaction_date + 'T00:00:00.000Z'); // Force UTC to avoid timezone issues
        
        // Ensure the transaction date is valid
        if (isNaN(transactionDate.getTime())) {
          console.log('⚠️ AgentManagement: Invalid transaction date:', t.transaction_date);
          return false;
        }
        
        const isInRange = transactionDate >= dateRange.from && transactionDate <= dateRange.to;
        
        if (isInRange) {
          console.log('✅ AgentManagement: Transaction date in range:', {
            transactionDate: transactionDate.toISOString(),
            fromDate: dateRange.from.toISOString(),
            toDate: dateRange.to.toISOString(),
            accountId: t.account_id,
            timeFrame: timeFrame
          });
        }
        
        return isInRange;
      })
    : transactions;

  console.log('📅 AgentManagement: Date filtering for timeframe:', timeFrame);
  console.log('📅 AgentManagement: Date range:', dateRange);
  console.log('📅 AgentManagement: Original transactions:', transactions.length);
  console.log('📅 AgentManagement: Filtered transactions:', filteredTransactions.length);
  
  // Sample a few transaction dates for debugging
  if (transactions.length > 0) {
    console.log('📊 AgentManagement: Sample transaction dates:', transactions.slice(0, 5).map(t => ({
      account_id: t.account_id,
      transaction_date: t.transaction_date,
      parsedDate: t.transaction_date ? new Date(t.transaction_date + 'T00:00:00.000Z').toISOString() : 'No date'
    })));
  }
  
  // Calculate commissions using filtered transactions
  const filteredCommissions = calculateLocationCommissions(filteredTransactions, assignments, locations);
  const filteredAgentSummaries = groupCommissionsByAgent(filteredCommissions);

  console.log('💰 AgentManagement: Filtered commission summaries for timeframe:', timeFrame, filteredAgentSummaries);

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

  // Build final agent data using the filtered commission summaries
  const agents = Array.from(allAgentNames).map(agentName => {
    const commissionSummary = filteredAgentSummaries.find(summary => summary.agentName === agentName);
    const manualAgent = manualAgents?.find(a => a.name === agentName);
    
    // Count unique locations assigned to this agent
    const assignedLocations = assignments?.filter(a => a.agent_name === agentName && a.is_active) || [];
    const locationsCount = assignedLocations.length;
    
    // Get total commission and location details from commission calculations
    const totalCommission = commissionSummary ? commissionSummary.totalCommission : 0;
    const locationCommissions = commissionSummary ? commissionSummary.locations : [];
    
    // Calculate total volume from commission data
    const totalVolume = locationCommissions.reduce((sum, loc) => sum + loc.locationVolume, 0);
    
    // Count unique accounts from commission data
    const uniqueAccountIds = new Set(
      locationCommissions
        .map(loc => locations?.find(l => l.id === loc.locationId)?.account_id)
        .filter(id => id)
    );
    const accountsCount = uniqueAccountIds.size;
    
    // Calculate average rate as percentage of commission to volume
    let avgRate;
    if (agentName === 'Merchant Hero') {
      avgRate = 'Remainder';
    } else {
      avgRate = totalVolume > 0 
        ? ((totalCommission / totalVolume) * 100).toFixed(2) + '%' 
        : '0%';
    }

    console.log(`💼 Agent ${agentName} final data:`, {
      totalCommission,
      locationCommissions: locationCommissions.length,
      totalVolume,
      accountsCount,
      locationsCount,
      timeFrame
    });

    return {
      name: agentName,
      totalRevenue: totalVolume,
      accountsCount,
      locationsCount,
      totalCommission,
      avgRate,
      status: manualAgent ? (manualAgent.is_active ? 'active' : 'inactive') : 'active',
      notes: manualAgent?.notes || '',
      locationCommissions: locationCommissions
    };
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

  // Show loading state while timeframes are being initialized
  if (timeFrames.length === 0 || !timeFrame) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Agent Management</h2>
          <p className="text-muted-foreground">Manage agent information and commission rates</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading timeframes...</p>
        </div>
      </div>
    );
  }

  if (transactions.length === 0 && assignments.length === 0 && locations.length === 0) {
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
            className="grid grid-cols-2 lg:grid-cols-4 bg-muted rounded-lg p-1 w-full sm:w-auto"
          >
            {timeFrames.map((frame) => (
              <ToggleGroupItem 
                key={frame.value}
                value={frame.value} 
                className="px-3 py-2 text-xs lg:text-sm font-medium rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
              >
                {frame.label}
              </ToggleGroupItem>
            ))}
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
                    <p className="font-semibold text-emerald-600">${agent.totalCommission.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Total Volume</p>
                  <p className="font-semibold text-emerald-600">${agent.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                </div>

                {agent.locationCommissions && agent.locationCommissions.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Commission by Location</p>
                    <div className="bg-muted rounded-md p-3 max-h-40 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs p-1">Location</TableHead>
                            <TableHead className="text-xs p-1 text-right">Commission</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {agent.locationCommissions.map((loc: any, locIndex: number) => {
                            // Use the same logic as in LocationCommissionReport
                            const commissionAmount = agent.name === 'Merchant Hero' 
                              ? loc.merchantHeroPayout 
                              : loc.agentPayout;
                            
                            console.log(`💳 Displaying commission for ${agent.name} at ${loc.locationName}: ${commissionAmount} (MH: ${loc.merchantHeroPayout}, Agent: ${loc.agentPayout})`);
                            
                            return (
                              <TableRow key={locIndex}>
                                <TableCell className="text-xs p-1 font-medium">
                                  {loc.locationName}
                                </TableCell>
                                <TableCell className="text-xs p-1 text-right text-emerald-600">
                                  ${commissionAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

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
