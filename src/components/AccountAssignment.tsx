import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Users, Search } from "lucide-react";
import { useState } from "react";

const AccountAssignment = () => {
  const [searchTerm, setSearchTerm] = useState("");

  // This component will be used for different account assignment functionality
  // than locations, so keeping it separate but removing mock data

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Account Assignment</h2>
          <p className="text-muted-foreground">Manage account-level agent assignments and commission rates</p>
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
                <SelectItem value="placeholder">No accounts available yet</SelectItem>
              </SelectContent>
            </Select>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="placeholder">No agents available yet</SelectItem>
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
              <span className="font-semibold">0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Multi-Agent Accounts</span>
              <span className="font-semibold">0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unassigned Accounts</span>
              <span className="font-semibold text-orange-600">0</span>
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
              <span className="font-semibold">0%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Highest Rate</span>
              <span className="font-semibold">0%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lowest Rate</span>
              <span className="font-semibold">0%</span>
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
          <div className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">No account assignments found. Upload transaction data to get started.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountAssignment;
