
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, Filter } from "lucide-react";
import { useSystemData } from "@/hooks/useSystemData";
import { useOptimizedSearch } from "@/hooks/useOptimizedSearch";
import LocationCard from "./LocationCard";
import LocationSummaryCards from "./LocationSummaryCards";
import SystemHealthIndicator from "./SystemHealthIndicator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const OptimizedLocations = () => {
  const [timeFrame, setTimeFrame] = useState("march");
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | undefined>();

  const { data, isLoading, error, invalidateCache } = useSystemData({
    timeFrame,
    customDateRange
  });

  const {
    searchTerm,
    setSearchTerm,
    sortField,
    sortDirection,
    handleSort,
    filteredItems,
    resultCount
  } = useOptimizedSearch(data?.locations || [], ['name', 'account_id', 'agentNames']);

  const handleTimeFrameChange = (value: string) => {
    setTimeFrame(value);
    if (value !== 'custom') {
      setCustomDateRange(undefined);
    }
  };

  const timeFrames = [
    { value: "march", label: "March" },
    { value: "april", label: "April" },
    { value: "may", label: "May" },
    { value: "june", label: "June" }
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading optimized locations data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Optimized Locations</h2>
          <p className="text-muted-foreground">
            Enhanced performance with smart search and filtering
          </p>
        </div>
      </div>

      <SystemHealthIndicator
        data={data}
        isLoading={isLoading}
        error={error}
        timeFrame={timeFrame}
      />

      <LocationSummaryCards locations={data?.locations || []} />

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>All Locations ({resultCount} found)</CardTitle>
            <div className="flex gap-4 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search locations, accounts, or agents..."
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <ToggleGroup 
                type="single" 
                value={timeFrame} 
                onValueChange={handleTimeFrameChange}
                className="grid grid-cols-4 bg-muted rounded-lg p-1"
              >
                {timeFrames.map((frame) => (
                  <ToggleGroupItem 
                    key={frame.value}
                    value={frame.value} 
                    className="px-3 py-2 text-sm font-medium rounded-md data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                  >
                    {frame.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSort('name')}
              className="flex items-center gap-1"
            >
              <ArrowUpDown className="h-3 w-3" />
              Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSort('totalVolume')}
              className="flex items-center gap-1"
            >
              <ArrowUpDown className="h-3 w-3" />
              Volume {sortField === 'totalVolume' && (sortDirection === 'asc' ? '↑' : '↓')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSort('totalCommission')}
              className="flex items-center gap-1"
            >
              <ArrowUpDown className="h-3 w-3" />
              Commission {sortField === 'totalCommission' && (sortDirection === 'asc' ? '↑' : '↓')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredItems.map((location) => (
                <LocationCard 
                  key={location.id} 
                  location={location} 
                  onUpdate={invalidateCache}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">
                {searchTerm ? 'No locations match your search criteria' : 'No locations found'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OptimizedLocations;
