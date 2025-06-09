
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const AgentManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: "",
    email: "",
    baseRate: "",
    status: "active"
  });
  const { toast } = useToast();

  const [agents, setAgents] = useState([
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
  ]);

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddAgent = () => {
    if (!newAgent.name || !newAgent.email || !newAgent.baseRate) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    const agent = {
      id: agents.length + 1,
      name: newAgent.name,
      email: newAgent.email,
      baseRate: newAgent.baseRate.includes('%') ? newAgent.baseRate : `${newAgent.baseRate}%`,
      accountsCount: 0,
      totalRevenue: "$0",
      status: newAgent.status
    };

    setAgents([...agents, agent]);
    setNewAgent({ name: "", email: "", baseRate: "", status: "active" });
    setIsAddDialogOpen(false);
    
    toast({
      title: "Success",
      description: "Agent added successfully"
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Agent Management</h2>
          <p className="text-muted-foreground">Manage agent information and commission rates</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add New Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Agent</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                  placeholder="Enter agent's full name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newAgent.email}
                  onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
                  placeholder="agent@merchanthero.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="baseRate">Base Rate (%) *</Label>
                <Input
                  id="baseRate"
                  value={newAgent.baseRate}
                  onChange={(e) => setNewAgent({ ...newAgent, baseRate: e.target.value })}
                  placeholder="1.5"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={newAgent.status}
                  onChange={(e) => setNewAgent({ ...newAgent, status: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddAgent}>
                Add Agent
              </Button>
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
