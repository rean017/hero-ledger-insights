
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Users, Building2 } from "lucide-react";

const Dashboard = () => {
  const stats = [
    {
      title: "Monthly Revenue",
      value: "$124,532.00",
      change: "+12.5%",
      trend: "up",
      icon: DollarSign,
    },
    {
      title: "Agent Payouts",
      value: "$23,890.00",
      change: "+8.2%",
      trend: "up",
      icon: Users,
    },
    {
      title: "Net Income",
      value: "$100,642.00",
      change: "+15.3%",
      trend: "up",
      icon: TrendingUp,
    },
    {
      title: "Active Accounts",
      value: "247",
      change: "+5.1%",
      trend: "up",
      icon: Building2,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Dashboard Overview</h2>
        <p className="text-muted-foreground">Welcome to your Merchant Hero admin dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="transition-all hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <p className="text-xs text-emerald-600 mt-1">
                  {stat.change} from last month
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent P&L Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Revenue</span>
                <span className="font-semibold">$124,532.00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Agent Commissions</span>
                <span className="font-semibold text-red-600">-$23,890.00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Operating Expenses</span>
                <span className="font-semibold text-red-600">-$8,500.00</span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Net Income</span>
                  <span className="font-bold text-emerald-600">$92,142.00</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Performing Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: "Sarah Johnson", revenue: "$15,230", commission: "$1,523" },
                { name: "Mike Chen", revenue: "$12,890", commission: "$1,289" },
                { name: "Emily Davis", revenue: "$11,450", commission: "$1,145" },
                { name: "David Wilson", revenue: "$9,870", commission: "$987" },
              ].map((agent) => (
                <div key={agent.name} className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-sm text-muted-foreground">Revenue: {agent.revenue}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-emerald-600">{agent.commission}</p>
                    <p className="text-sm text-muted-foreground">Commission</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
