import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, Wrench } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const DataRepairUtility = () => {
  const [isRepairing, setIsRepairing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [repairComplete, setRepairComplete] = useState(false);
  const [repairResults, setRepairResults] = useState<{
    agentsCreated: number;
    assignmentsCreated: number;
    transactionsUpdated: number;
  } | null>(null);
  const { toast } = useToast();

  const handleRepair = async () => {
    setIsRepairing(true);
    setProgress(0);
    
    try {
      // Step 1: Get all transactions with agent_payout > 0 but no agent assignments
      toast({
        title: "Starting data repair",
        description: "Analyzing transactions..."
      });
      
      const { data: transactions, error: transactionsError } = await supabase
        .from('transactions')
        .select(`
          id,
          location_id,
          agent_payout,
          volume,
          agent_name,
          locations (
            id,
            name
          )
        `)
        .gt('agent_payout', 0);

      if (transactionsError) throw transactionsError;

      if (!transactions || transactions.length === 0) {
        toast({
          title: "No data to repair",
          description: "All transactions already have proper agent assignments"
        });
        setIsRepairing(false);
        return;
      }

      setProgress(20);

      // Step 2: Group transactions by location and agent to create assignments
      const locationAgentMap = new Map<string, {
        locationId: string;
        agentName: string;
        totalPayout: number;
        totalVolume: number;
        locationName: string;
      }>();

      transactions.forEach(transaction => {
        if (transaction.agent_name && transaction.location_id && transaction.locations) {
          const key = `${transaction.location_id}-${transaction.agent_name}`;
          const existing = locationAgentMap.get(key);
          
          if (existing) {
            existing.totalPayout += transaction.agent_payout || 0;
            existing.totalVolume += transaction.volume || 0;
          } else {
            locationAgentMap.set(key, {
              locationId: transaction.location_id,
              agentName: transaction.agent_name,
              totalPayout: transaction.agent_payout || 0,
              totalVolume: transaction.volume || 0,
              locationName: transaction.locations.name
            });
          }
        }
      });

      setProgress(40);

      // Step 3: Create missing agents
      const uniqueAgentNames = Array.from(new Set(
        Array.from(locationAgentMap.values()).map(item => item.agentName)
      ));

      let agentsCreated = 0;
      for (const agentName of uniqueAgentNames) {
        const { data: existingAgent } = await supabase
          .from('agents')
          .select('id')
          .eq('name', agentName)
          .maybeSingle();

        if (!existingAgent) {
          const { error: agentError } = await supabase
            .from('agents')
            .insert([{
              name: agentName,
              is_active: true
            }]);

          if (agentError) throw agentError;
          agentsCreated++;
        }
      }

      setProgress(60);

      // Step 4: Create missing agent assignments
      let assignmentsCreated = 0;
      for (const [key, item] of locationAgentMap.entries()) {
        const { data: existingAssignment } = await supabase
          .from('location_agent_assignments')
          .select('id')
          .eq('location_id', item.locationId)
          .eq('agent_name', item.agentName)
          .maybeSingle();

        if (!existingAssignment) {
          // Calculate commission rate
          const commissionRate = item.totalVolume > 0 ? (item.totalPayout / item.totalVolume) : 0;

          const { error: assignmentError } = await supabase
            .from('location_agent_assignments')
            .insert([{
              location_id: item.locationId,
              agent_name: item.agentName,
              commission_rate: commissionRate,
              is_active: true
            }]);

          if (assignmentError) throw assignmentError;
          assignmentsCreated++;
        }
      }

      setProgress(80);

      // Step 5: Update transactions that are missing agent_name but have agent_payout
      const { data: transactionsToUpdate } = await supabase
        .from('transactions')
        .select('id, location_id, agent_payout')
        .gt('agent_payout', 0)
        .is('agent_name', null);

      let transactionsUpdated = 0;
      if (transactionsToUpdate && transactionsToUpdate.length > 0) {
        // For transactions without agent names, try to infer from assignments
        for (const transaction of transactionsToUpdate) {
          const { data: assignments } = await supabase
            .from('location_agent_assignments')
            .select('agent_name')
            .eq('location_id', transaction.location_id)
            .eq('is_active', true)
            .limit(1);

          if (assignments && assignments.length > 0) {
            const { error: updateError } = await supabase
              .from('transactions')
              .update({ agent_name: assignments[0].agent_name })
              .eq('id', transaction.id);

            if (!updateError) {
              transactionsUpdated++;
            }
          }
        }
      }

      setProgress(100);

      setRepairResults({
        agentsCreated,
        assignmentsCreated,
        transactionsUpdated
      });

      setRepairComplete(true);
      
      toast({
        title: "Data repair completed",
        description: `Created ${agentsCreated} agents, ${assignmentsCreated} assignments, updated ${transactionsUpdated} transactions`
      });

    } catch (error) {
      console.error('Repair error:', error);
      toast({
        title: "Repair failed",
        description: "There was an error repairing the data",
        variant: "destructive"
      });
    } finally {
      setIsRepairing(false);
    }
  };

  const resetRepair = () => {
    setRepairComplete(false);
    setRepairResults(null);
    setProgress(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          Data Repair Utility
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800">Data Repair Needed</p>
              <p className="text-yellow-700 mt-1">
                This utility will analyze your uploaded transaction data and create missing agent assignments. 
                This is needed for volume data to display correctly on locations.
              </p>
            </div>
          </div>
        </div>

        {isRepairing && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Repairing data...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {repairComplete && repairResults && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-green-800">Repair Completed Successfully</p>
                <ul className="text-green-700 mt-1 space-y-1">
                  <li>• Created {repairResults.agentsCreated} new agents</li>
                  <li>• Created {repairResults.assignmentsCreated} new location assignments</li>
                  <li>• Updated {repairResults.transactionsUpdated} transactions</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button 
            onClick={handleRepair}
            disabled={isRepairing || repairComplete}
            className="flex-1"
          >
            {isRepairing ? "Repairing..." : "Run Data Repair"}
          </Button>
          
          {repairComplete && (
            <Button variant="outline" onClick={resetRepair}>
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};