
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Download, FileText, TrendingUp, TrendingDown, User, MapPin, Percent } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

const PLReports = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("current-month");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // Fetch all agents for the dropdown
  const { data: agents } = useQuery({
    queryKey: ['agents-for-pl'],
    queryFn: async () => {
      // Get unique agents from transactions
      const { data: transactionAgents, error: transactionError } = await supabase
        .from('transactions')
        .select('agent_name')
        .not('agent_name', 'is', null);

      if (transactionError) throw transactionError;

      // Get manually added agents
      const { data: manualAgents, error: manualError } = await supabase
        .from('agents')
        .select('name')
        .eq('is_active', true);

      if (manualError) throw manualError;

      // Combine and deduplicate agents
      const allAgentNames = new Set<string>();
      
      transactionAgents?.forEach(t => {
        if (t.agent_name) allAgentNames.add(t.agent_name);
      });
      
      manualAgents?.forEach(a => {
        allAgentNames.add(a.name);
      });

      return Array.from(allAgentNames).sort().map(name => ({
        label: name,
        value: name
      }));
    }
  });

  const getDateRange = (period: string) => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    switch (period) {
      case "current-month":
        return {
          start: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`,
          label: new Date(currentYear, currentMonth).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
        };
      case "last-month":
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return {
          start: `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
          label: new Date(lastMonthYear, lastMonth).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
        };
      case "current-quarter":
        const quarterStart = Math.floor(currentMonth / 3) * 3;
        return {
          start: `${currentYear}-${String(quarterStart + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(quarterStart + 4).padStart(2, '0')}-01`,
          label: `Q${Math.floor(currentMonth / 3) + 1} ${currentYear}`
        };
      case "current-year":
        return {
          start: `${currentYear}-01-01`,
          end: `${currentYear + 1}-01-01`,
          label: currentYear.toString()
        };
      case "last-12-months":
        const twelveMonthsAgo = new Date(currentYear, currentMonth - 12, 1);
        return {
          start: `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`,
          label: "Last 12 Months"
        };
      default:
        return {
          start: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`,
          end: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`,
          label: new Date(currentYear, currentMonth).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
        };
    }
  };

  const dateRange = getDateRange(selectedPeriod);

  // Fetch detailed agent location data
  const { data: agentLocationData, isLoading } = useQuery({
    queryKey: ['agent-location-pl-data', selectedAgents, selectedPeriod],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('transaction_date, volume, debit_volume, agent_payout, processor, agent_name, account_id')
        .gte('transaction_date', dateRange.start)
        .lt('transaction_date', dateRange.end)
        .order('transaction_date', { ascending: false });

      // Filter by selected agents if any are selected
      if (selectedAgents.length > 0) {
        query = query.in('agent_name', selectedAgents);
      }

      const { data: transactions, error } = await query;
      if (error) throw error;

      // Get location assignments for BPS rates
      const { data: assignments, error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .select(`
          agent_name,
          commission_rate,
          location_id,
          locations(name, account_id)
        `)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      // Get all locations for account mapping
      const { data: locations, error: locationError } = await supabase
        .from('locations')
        .select('id, name, account_id');

      if (locationError) throw locationError;

      // Process data by agent and location
      const agentLocationMap = new Map();

      transactions?.forEach(t => {
        if (!t.agent_name) return;
        
        // Find location by account_id
        const location = locations?.find(loc => loc.account_id === t.account_id);
        const locationName = location?.name || t.account_id || 'Unknown Location';
        
        // Find assignment for this agent and location
        const assignment = assignments?.find(a => 
          a.agent_name === t.agent_name && 
          a.location_id === location?.id
        );
        
        const key = `${t.agent_name}-${locationName}`;
        
        if (!agentLocationMap.has(key)) {
          agentLocationMap.set(key, {
            agentName: t.agent_name,
            locationName,
            accountId: t.account_id,
            bpsRate: assignment ? (assignment.commission_rate * 100) : 0,
            volume: 0,
            debitVolume: 0,
            agentPayout: 0,
            transactionCount: 0
          });
        }
        
        const data = agentLocationMap.get(key);
        data.volume += t.volume || 0;
        data.debitVolume += t.debit_volume || 0;
        data.agentPayout += t.agent_payout || 0;
        data.transactionCount += 1;
      });

      return Array.from(agentLocationMap.values()).sort((a, b) => 
        a.agentName.localeCompare(b.agentName) || a.locationName.localeCompare(b.locationName)
      );
    }
  });

  const { data: periodSummary } = useQuery({
    queryKey: ['period-summary', selectedAgents, selectedPeriod],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('volume, agent_payout, debit_volume')
        .gte('transaction_date', dateRange.start)
        .lt('transaction_date', dateRange.end);

      if (selectedAgents.length > 0) {
        query = query.in('agent_name', selectedAgents);
      }

      const { data: transactions, error } = await query;
      if (error) throw error;

      const totalRevenue = transactions?.reduce((sum, t) => sum + (t.volume || 0), 0) || 0;
      const totalExpenses = transactions?.reduce((sum, t) => sum + (t.agent_payout || 0), 0) || 0;
      const totalDebitVolume = transactions?.reduce((sum, t) => sum + (t.debit_volume || 0), 0) || 0;
      const netIncome = totalRevenue - totalExpenses;
      const transactionCount = transactions?.length || 0;
      
      return {
        totalRevenue,
        totalExpenses,
        totalDebitVolume,
        netIncome,
        transactionCount,
        profitMargin: totalRevenue > 0 ? ((netIncome / totalRevenue) * 100).toFixed(1) : '0.0'
      };
    }
  });

  const generatePDFReport = async () => {
    // Create a new window for the report
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) return;

    const agentName = selectedAgents.length === 0 
      ? 'All Agents' 
      : selectedAgents.length === 1 
        ? selectedAgents[0] 
        : `${selectedAgents.length} Selected Agents`;
    const reportDate = new Date().toLocaleDateString();
    
    const reportHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>P&L Report - ${agentName}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 40px; 
              color: #333;
              line-height: 1.6;
            }
            .header { 
              text-align: center; 
              margin-bottom: 40px;
              border-bottom: 3px solid #22c55e;
              padding-bottom: 20px;
            }
            .logo {
              width: 200px;
              height: auto;
              margin-bottom: 20px;
            }
            .company-name {
              font-size: 24px;
              font-weight: bold;
              color: #22c55e;
              margin: 10px 0;
            }
            .report-title {
              font-size: 20px;
              color: #1f2937;
              margin: 5px 0;
            }
            .report-period {
              font-size: 16px;
              color: #6b7280;
            }
            .summary-section {
              background: #f9fafb;
              padding: 20px;
              border-radius: 8px;
              margin: 30px 0;
              border-left: 4px solid #22c55e;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 20px;
              margin-top: 15px;
            }
            .summary-item {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #e5e7eb;
            }
            .summary-item:last-child {
              border-bottom: none;
              font-weight: bold;
              font-size: 18px;
              color: #22c55e;
            }
            .label { font-weight: 500; }
            .value { font-weight: 600; }
            .positive { color: #22c55e; }
            .negative { color: #ef4444; }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 30px 0;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            th, td { 
              padding: 12px; 
              text-align: left; 
              border-bottom: 1px solid #e5e7eb;
            }
            th { 
              background-color: #22c55e; 
              color: white;
              font-weight: 600;
            }
            tr:hover { background-color: #f9fafb; }
            .footer {
              margin-top: 50px;
              text-align: center;
              font-size: 12px;
              color: #6b7280;
              border-top: 1px solid #e5e7eb;
              padding-top: 20px;
            }
            @media print {
              body { margin: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="/lovable-uploads/e5192b97-a74b-44d2-b5ab-f72d228fbad9.png" alt="Merchant Hero Logo" class="logo">
            <div class="company-name">MERCHANT HERO</div>
            <div class="report-title">Profit & Loss Report</div>
            <div class="report-period">Agent: ${agentName} | Period: ${dateRange.label} | Generated: ${reportDate}</div>
          </div>

          <div class="summary-section">
            <h3>${dateRange.label} Summary</h3>
            <div class="summary-grid">
              <div>
                <div class="summary-item">
                  <span class="label">Total Sales Volume:</span>
                  <span class="value">$${periodSummary?.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Total Expenses:</span>
                  <span class="value negative">$${periodSummary?.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Net Income:</span>
                  <span class="value positive">$${periodSummary?.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
              </div>
              <div>
                <div class="summary-item">
                  <span class="label">Debit Volume:</span>
                  <span class="value">$${periodSummary?.totalDebitVolume.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Transaction Count:</span>
                  <span class="value">${periodSummary?.transactionCount.toLocaleString() || '0'}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Profit Margin:</span>
                  <span class="value positive">${periodSummary?.profitMargin || '0.0'}%</span>
                </div>
              </div>
            </div>
          </div>

          <h3>Agent Location Performance Details</h3>
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Location</th>
                <th>Account ID</th>
                <th>BPS Rate</th>
                <th>Sales Volume</th>
                <th>Debit Volume</th>
                <th>Agent Payout</th>
                <th>Transactions</th>
              </tr>
            </thead>
            <tbody>
              ${agentLocationData?.map(data => `
                <tr>
                  <td>${data.agentName}</td>
                  <td>${data.locationName}</td>
                  <td>${data.accountId || 'N/A'}</td>
                  <td>${data.bpsRate.toFixed(2)} BPS</td>
                  <td>$${data.volume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td>$${data.debitVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td class="positive">$${data.agentPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td>${data.transactionCount}</td>
                </tr>
              `).join('') || '<tr><td colspan="8">No data available</td></tr>'}
            </tbody>
          </table>

          <div class="footer">
            <p>This report was generated on ${reportDate} by Merchant Hero P&L System</p>
            <p>© ${new Date().getFullYear()} Merchant Hero. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    reportWindow.document.write(reportHTML);
    reportWindow.document.close();
    
    // Auto-print after a short delay
    setTimeout(() => {
      reportWindow.print();
    }, 1000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">P&L Reports</h2>
          <p className="text-muted-foreground">Generate comprehensive profit and loss reports by agent and time period</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading P&L data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">P&L Reports</h2>
          <p className="text-muted-foreground">Generate comprehensive profit and loss reports by agent and time period</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={generatePDFReport}>
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
          <Button className="gap-2" onClick={generatePDFReport}>
            <FileText className="h-4 w-4" />
            Generate Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Report Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Agents</label>
              <MultiSelect
                options={agents || []}
                selected={selectedAgents}
                onChange={setSelectedAgents}
                placeholder="Select agents..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Period</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current-month">Current Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="current-quarter">Current Quarter</SelectItem>
                  <SelectItem value="current-year">Current Year</SelectItem>
                  <SelectItem value="last-12-months">Last 12 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedAgents.length === 0 
                ? 'All Agents' 
                : selectedAgents.length === 1 
                  ? selectedAgents[0] 
                  : `${selectedAgents.length} Selected Agents`} Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Sales Volume</span>
                <span className="font-semibold">${periodSummary?.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Expenses</span>
                <span className="font-semibold text-red-600">${periodSummary?.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Debit Volume</span>
                <span className="font-semibold">${periodSummary?.totalDebitVolume.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between">
                  <span className="font-semibold">Net Income</span>
                  <span className="font-bold text-emerald-600">${periodSummary?.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</span>
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
                <span className="font-semibold">{periodSummary?.profitMargin || '0.0'}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transactions</span>
                <span className="font-semibold">{periodSummary?.transactionCount.toLocaleString() || '0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period</span>
                <span className="font-semibold">{dateRange.label}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Agent Location Performance Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agentLocationData && agentLocationData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Agent
                      </div>
                    </th>
                    <th className="text-left p-4 font-medium text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Location
                      </div>
                    </th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Account ID</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Percent className="h-4 w-4" />
                        BPS Rate
                      </div>
                    </th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Sales Volume</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Debit Volume</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Agent Payout</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {agentLocationData.map((data, index) => (
                    <tr key={index} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4 font-medium">{data.agentName}</td>
                      <td className="p-4 font-medium">{data.locationName}</td>
                      <td className="p-4 text-muted-foreground">{data.accountId || 'N/A'}</td>
                      <td className="p-4 font-semibold text-blue-600">{data.bpsRate.toFixed(2)} BPS</td>
                      <td className="p-4 font-semibold">${data.volume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 font-semibold">${data.debitVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 font-semibold text-emerald-600">
                        ${data.agentPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 font-medium">{data.transactionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No data available for the selected agent and period. Upload transaction data to see reports.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PLReports;
