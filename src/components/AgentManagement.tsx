
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { useState } from "react";

const AgentManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const agents = [
    {
      id: 1,
      name: "Sarah Johnson",
      email: "sarah.j@merchanthero.com",
      baseRate: "1.5%",
      accountsCount: 12,
      totalRevenue: "$15,230",
      status: "active",
    },
    {
      id: 2,
      name: "Mike Chen",
      email: "mike.c@merchanthero.com",
      baseRate: "1.25%",
      accountsCount: 8,
      totalRevenue: "$12,890",
      status: "active",
    },
    {
      id: 3,
      name: "Emily Davis",
      email: "emily.d@merchanthero.com",
      baseRate: "1.75%",
      accountsCount: 15,
      totalRevenue: "$11,450",
      status: "active",
    },
    {
      id: 4,
      name: "David Wilson",
      email: "david.w@merchanthero.com",
      baseRate: "1.0%",
      accountsCount: 6,
      totalRevenue: "$9,870",
      status: "inactive",
    },
  ];

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Agent Management</h2>
          <p className="text-muted-foreground">Manage agent information and commission rates</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add New Agent
        </Button>
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium text-muted-foreground">Agent</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Base Rate</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Accounts</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((agent) => (
                  <tr key={agent.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="p-4">
                      <div>
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-sm text-muted-foreground">{agent.email}</p>
                      </div>
                    </td>
                    <td className="p-4 font-semibold">{agent.baseRate}</td>
                    <td className="p-4">{agent.accountsCount}</td>
                    <td className="p-4 font-semibold text-emerald-600">{agent.totalRevenue}</td>
                    <td className="p-4">
                      <Badge variant={agent.status === 'active' ? 'default' : 'secondary'}>
                        {agent.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentManagement;
