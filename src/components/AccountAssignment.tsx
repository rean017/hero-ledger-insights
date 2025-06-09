
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Users, Search } from "lucide-react";
import { useState } from "react";

const AccountAssignment = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const accounts = [
    {
      id: 1,
      accountName: "TechCorp Solutions",
      accountType: "Enterprise",
      monthlyRevenue: "$8,500",
      agents: [
        { name: "Sarah Johnson", rate: "1.5%" },
        { name: "Mike Chen", rate: "0.5%" }
      ],
      status: "active",
    },
    {
      id: 2,
      accountName: "Local Restaurant Group",
      accountType: "Small Business",
      monthlyRevenue: "$3,200",
      agents: [
        { name: "Emily Davis", rate: "2.0%" }
      ],
      status: "active",
    },
    {
      id: 3,
      accountName: "Fashion Retailer Inc",
      accountType: "Mid-Market",
      monthlyRevenue: "$12,800",
      agents: [
        { name: "Sarah Johnson", rate: "1.25%" },
        { name: "David Wilson", rate: "0.75%" },
        { name: "Emily Davis", rate: "0.5%" }
      ],
      status: "active",
    },
    {
      id: 4,
      accountName: "Healthcare Partners",
      accountType: "Enterprise",
      monthlyRevenue: "$15,600",
      agents: [
        { name: "Mike Chen", rate: "1.8%" }
      ],
      status: "pending",
    },
  ];

  const filteredAccounts = accounts.filter(account =>
    account.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.accountType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Account Assignment</h2>
          <p className="text-muted-foreground">Manage agent assignments and commission rates per account</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add New Assignment
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quick Assign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="techcorp">TechCorp Solutions</SelectItem>
                <SelectItem value="restaurant">Local Restaurant Group</SelectItem>
                <SelectItem value="fashion">Fashion Retailer Inc</SelectItem>
              </SelectContent>
            </Select>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sarah">Sarah Johnson</SelectItem>
                <SelectItem value="mike">Mike Chen</SelectItem>
                <SelectItem value="emily">Emily Davis</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Commission Rate (e.g., 1.5%)" />
            <Button className="w-full">Assign Agent</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Assignment Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Accounts</span>
              <span className="font-semibold">47</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Multi-Agent Accounts</span>
              <span className="font-semibold">12</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unassigned Accounts</span>
              <span className="font-semibold text-orange-600">3</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Rate Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg. Rate</span>
              <span className="font-semibold">1.4%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Highest Rate</span>
              <span className="font-semibold">2.0%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lowest Rate</span>
              <span className="font-semibold">0.5%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Account Assignments</CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredAccounts.map((account) => (
              <div key={account.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{account.accountName}</h3>
                      <Badge variant="outline">{account.accountType}</Badge>
                      <Badge variant={account.status === 'active' ? 'default' : 'secondary'}>
                        {account.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mb-3">Monthly Revenue: {account.monthlyRevenue}</p>
                    
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Assigned Agents ({account.agents.length}):</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {account.agents.map((agent, index) => (
                        <div key={index} className="bg-muted rounded-full px-3 py-1 text-sm">
                          {agent.name} - <span className="font-semibold text-emerald-600">{agent.rate}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Edit className="h-4 w-4" />
                      Edit Assignment
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountAssignment;
