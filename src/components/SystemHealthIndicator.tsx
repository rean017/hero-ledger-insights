
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, XCircle, Activity } from "lucide-react";

interface SystemHealthProps {
  data: {
    locations: any[];
    transactions: any[];
    agents: any[];
    stats: {
      totalRevenue: number;
      totalAgentPayouts: number;
      locationsCount: number;
      transactionsCount: number;
    };
  } | undefined;
  isLoading: boolean;
  error: any;
  timeFrame: string;
}

const SystemHealthIndicator: React.FC<SystemHealthProps> = ({ 
  data, 
  isLoading, 
  error, 
  timeFrame 
}) => {
  const getHealthStatus = () => {
    if (error) return { status: 'error', color: 'destructive', icon: XCircle };
    if (isLoading) return { status: 'loading', color: 'secondary', icon: Activity };
    if (!data || data.transactions.length === 0) {
      return { status: 'warning', color: 'warning', icon: AlertTriangle };
    }
    return { status: 'healthy', color: 'success', icon: CheckCircle };
  };

  const getStatusMessage = () => {
    const health = getHealthStatus();
    
    switch (health.status) {
      case 'error':
        return `System Error: ${error?.message || 'Unknown error'}`;
      case 'loading':
        return 'Loading system data...';
      case 'warning':
        return `No data available for ${timeFrame.toUpperCase()}`;
      case 'healthy':
        return `System Healthy: ${data?.stats.transactionsCount || 0} transactions loaded`;
      default:
        return 'System status unknown';
    }
  };

  const health = getHealthStatus();
  const Icon = health.icon;

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className={`h-5 w-5 ${
              health.status === 'error' ? 'text-red-500' :
              health.status === 'warning' ? 'text-yellow-500' :
              health.status === 'loading' ? 'text-blue-500' :
              'text-green-500'
            }`} />
            <div>
              <div className="font-medium text-sm">{getStatusMessage()}</div>
              {data && (
                <div className="text-xs text-muted-foreground">
                  {data.locations.length} locations • {data.agents.length} agents • {timeFrame.toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <Badge variant={health.color === 'success' ? 'default' : 'destructive'}>
            {health.status.toUpperCase()}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemHealthIndicator;
