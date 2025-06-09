import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, TrendingUp, TrendingDown } from "lucide-react";
import FileUpload from "./FileUpload";

const PLReports = () => {
  const monthlyData = [
    { month: "January 2024", revenue: 118500, expenses: 32400, netIncome: 86100, growth: 8.5 },
    { month: "February 2024", revenue: 124200, expenses: 35200, netIncome: 89000, growth: 3.4 },
    { month: "March 2024", revenue: 132800, expenses: 38100, netIncome: 94700, growth: 6.4 },
    { month: "April 2024", revenue: 127300, expenses: 36900, netIncome: 90400, growth: -4.6 },
    { month: "May 2024", revenue: 135600, expenses: 39200, netIncome: 96400, growth: 6.6 },
    { month: "June 2024", revenue: 142100, expenses: 41500, netIncome: 100600, growth: 4.4 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">P&L Reports</h2>
          <p className="text-muted-foreground">Upload transaction data and view comprehensive profit and loss analysis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
          <Button className="gap-2">
            <FileText className="h-4 w-4" />
            Generate Report
          </Button>
        </div>
      </div>

      {/* File Upload Section */}
      <FileUpload />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Report Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select defaultValue="current-month">
              <SelectTrigger>
                <SelectValue placeholder="Select Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current-month">Current Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="quarter">Current Quarter</SelectItem>
                <SelectItem value="year">Current Year</SelectItem>
                <SelectItem value="trailing-12">Trailing 12 Months</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all-agents">
              <SelectTrigger>
                <SelectValue placeholder="Filter by Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-agents">All Agents</SelectItem>
                <SelectItem value="sarah">Sarah Johnson</SelectItem>
                <SelectItem value="mike">Mike Chen</SelectItem>
                <SelectItem value="emily">Emily Davis</SelectItem>
              </SelectContent>
            </Select>
            <Button className="w-full">Apply Filters</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current Month Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Revenue</span>
                <span className="font-semibold">$142,100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Expenses</span>
                <span className="font-semibold text-red-600">$41,500</span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between">
                  <span className="font-semibold">Net Income</span>
                  <span className="font-bold text-emerald-600">$100,600</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Growth Rate</span>
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold text-emerald-600">+4.4%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profit Margin</span>
                <span className="font-semibold">70.8%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agent Commission Rate</span>
                <span className="font-semibold">16.9%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operating Expense Ratio</span>
                <span className="font-semibold">29.2%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">12M Avg Growth</span>
                <span className="font-semibold text-emerald-600">+5.2%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>12-Month Trailing History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium text-muted-foreground">Month</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Revenue</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Agent Payouts</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Other Expenses</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Net Income</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Growth</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((data, index) => (
                  <tr key={index} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="p-4 font-medium">{data.month}</td>
                    <td className="p-4 font-semibold">${data.revenue.toLocaleString()}</td>
                    <td className="p-4 font-semibold text-orange-600">
                      ${Math.round(data.revenue * 0.169).toLocaleString()}
                    </td>
                    <td className="p-4 font-semibold text-red-600">
                      ${(data.expenses - Math.round(data.revenue * 0.169)).toLocaleString()}
                    </td>
                    <td className="p-4 font-semibold text-emerald-600">
                      ${data.netIncome.toLocaleString()}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        {data.growth >= 0 ? (
                          <TrendingUp className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                        <span className={`font-semibold ${data.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {data.growth > 0 ? '+' : ''}{data.growth}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent Payout Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { name: "Sarah Johnson", accounts: 12, payout: "$6,890", rate: "1.45%" },
              { name: "Mike Chen", accounts: 8, payout: "$4,230", rate: "1.38%" },
              { name: "Emily Davis", accounts: 15, payout: "$7,450", rate: "1.52%" },
              { name: "David Wilson", accounts: 6, payout: "$2,180", rate: "1.25%" },
              { name: "Lisa Rodriguez", accounts: 9, payout: "$3,890", rate: "1.41%" },
              { name: "James Kim", accounts: 7, payout: "$2,950", rate: "1.33%" },
            ].map((agent) => (
              <div key={agent.name} className="border rounded-lg p-4">
                <h4 className="font-semibold mb-2">{agent.name}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Accounts:</span>
                    <span>{agent.accounts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Rate:</span>
                    <span>{agent.rate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payout:</span>
                    <span className="font-semibold text-emerald-600">{agent.payout}</span>
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

export default PLReports;
