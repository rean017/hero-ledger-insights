
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MapPin, DollarSign, TrendingUp, Calculator } from "lucide-react";
import { calculateLocationCommissions, groupCommissionsByAgent } from "@/utils/commissionCalculations";

interface LocationCommissionReportProps {
  transactions: any[];
  assignments: any[];
  locations: any[];
}

const LocationCommissionReport = ({ transactions, assignments, locations }: LocationCommissionReportProps) => {
  const commissions = calculateLocationCommissions(transactions, assignments, locations);
  const agentSummaries = groupCommissionsByAgent(commissions);

  const totalCommissions = commissions.reduce((sum, c) => sum + c.commission, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Total Commissions
              </span>
              <span className="font-semibold">${totalCommissions.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Active Locations
              </span>
              <span className="font-semibold">{new Set(commissions.map(c => c.locationId)).size}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Active Agents
              </span>
              <span className="font-semibold">{agentSummaries.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Agent Commission Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {agentSummaries.map((summary) => (
              <div key={summary.agentName} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">{summary.agentName}</h3>
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    ${summary.totalCommission.toLocaleString()}
                  </Badge>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>Volume</TableHead>
                      <TableHead>BPS Rate</TableHead>
                      <TableHead>Commission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.locations.map((location) => (
                      <TableRow key={`${location.locationId}-${location.agentName}`}>
                        <TableCell className="font-medium">{location.locationName}</TableCell>
                        <TableCell>${location.locationVolume.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{location.bpsRate} BPS</Badge>
                        </TableCell>
                        <TableCell className="font-semibold">
                          ${location.commission.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
            
            {agentSummaries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No commission data available. Make sure agents are assigned to locations and transaction data is uploaded.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Detailed Commission Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Location Volume</TableHead>
                <TableHead>BPS Rate</TableHead>
                <TableHead>Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.map((commission, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{commission.agentName}</TableCell>
                  <TableCell>{commission.locationName}</TableCell>
                  <TableCell>${commission.locationVolume.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{commission.bpsRate} BPS</Badge>
                  </TableCell>
                  <TableCell className="font-semibold">
                    ${commission.commission.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {commissions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No commission data to display. Upload transaction data and assign agents to locations.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationCommissionReport;
