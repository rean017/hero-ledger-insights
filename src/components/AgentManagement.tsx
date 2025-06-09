
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const AgentManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const { data: agents, isLoading, refetch } = useQuery({
    queryKey: ['agents-data'],
    queryFn: async () => {
      // Get unique agents from transactions
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('agent_name, volume, agent_payout')
        .not('agent_name', 'is', null);

      if (error) throw error;

      const agentStats = transactions?.reduce((acc, t) => {
        const name = t.agent_name!;
        if (!acc[name]) {
          acc[name] = { 
            name, 
            totalRevenue: 0, 
            totalCommission: 0, 
            accountsCount: new Set(),
            status: 'active'
          };
        }
        acc[name].totalRevenue += t.volume || 0;
        acc[name].totalCommission += t.agent_payout || 0;
        return acc;
      }, {} as Record<string, any>) || {};

      // Get account counts per agent
      const { data: accountData, error: accountError } = await supabase
        .from('transactions')
        .select('agent_name, account_id')
        .not('agent_name', 'is', null)
        .not('account_id', 'is', null);

      if (accountError) throw accountError;

      accountData?.forEach(t => {
        if (agentStats[t.agent_name!]) {
          agentStats[t.agent_name!].accountsCount.add(t.account_id);
        }
      });

      return Object.values(agentStats).map(agent => ({
        ...agent,
        accountsCount: agent.accountsCount.size,
        avgRate: agent.totalRevenue > 0 ? ((agent.totalCommission / agent.totalRevenue) * 100).toFixed(2) + '%' : '0%'
      }));
    }
  });

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
          <p className="text-muted-foreground">Manage agent information and commission rates from uploaded data</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>All Agents (From Uploaded Data)</CardTitle>
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
                    <th className="text-left p-4 font-medium text-muted-foreground">Total Revenue</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Total Commission</th>
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
              <p className="text-muted-foreground">No agents found. Upload transaction data to see agents.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentManagement;
