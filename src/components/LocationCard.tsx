
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Users, Edit3, Check, X, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import LocationAgentInlineEdit from "./LocationAgentInlineEdit";
import AgentAssignmentDisplay from "./AgentAssignmentDisplay";

interface LocationWithExtras {
  id: string;
  name: string;
  account_id?: string;
  account_type?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  is_franchise?: boolean;
  assignedAgents: number;
  totalVolume: number;
  totalCommission: number;
  agentNames: string;
  assignments: any[];
  commissions: any[];
}

interface LocationCardProps {
  location: LocationWithExtras;
  onUpdate: () => void;
}

const LocationCard = ({ location, onUpdate }: LocationCardProps) => {
  const [editingNotes, setEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState("");
  const [editingLocation, setEditingLocation] = useState(false);
  const [tempLocationName, setTempLocationName] = useState("");
  const [tempAccountId, setTempAccountId] = useState("");
  
  const { toast } = useToast();

  const handleToggleFranchise = async () => {
    try {
      const newFranchiseStatus = !location.is_franchise;
      
      const { error } = await supabase
        .from('locations')
        .update({ is_franchise: newFranchiseStatus })
        .eq('id', location.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Location ${newFranchiseStatus ? 'marked as' : 'unmarked as'} franchise`,
      });

      onUpdate();
    } catch (error: any) {
      console.error('Error toggling franchise status:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update franchise status",
        variant: "destructive"
      });
    }
  };

  const handleEditLocation = async () => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ 
          name: tempLocationName.trim(),
          account_id: tempAccountId.trim()
        })
        .eq('id', location.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Location updated successfully"
      });

      setEditingLocation(false);
      setTempLocationName("");
      setTempAccountId("");
      onUpdate();
    } catch (error: any) {
      console.error('Error updating location:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update location",
        variant: "destructive"
      });
    }
  };

  const startEditingLocation = () => {
    setEditingLocation(true);
    setTempLocationName(location.name);
    setTempAccountId(location.account_id || "");
  };

  const cancelEditingLocation = () => {
    setEditingLocation(false);
    setTempLocationName("");
    setTempAccountId("");
  };

  const handleNotesUpdate = async () => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ notes: tempNotes })
        .eq('id', location.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Notes updated successfully"
      });

      setEditingNotes(false);
      setTempNotes("");
      onUpdate();
    } catch (error: any) {
      console.error('Error updating notes:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update notes",
        variant: "destructive"
      });
    }
  };

  const startEditingNotes = () => {
    setEditingNotes(true);
    setTempNotes(location.notes || "");
  };

  const cancelEditingNotes = () => {
    setEditingNotes(false);
    setTempNotes("");
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            {editingLocation ? (
              <div className="flex-1 space-y-2 pr-2">
                <Input
                  value={tempLocationName}
                  onChange={(e) => setTempLocationName(e.target.value)}
                  placeholder="Location name"
                  className="font-semibold"
                />
                <Input
                  value={tempAccountId}
                  onChange={(e) => setTempAccountId(e.target.value)}
                  placeholder="Account ID"
                  className="text-sm font-mono"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleEditLocation}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEditingLocation}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1 flex-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="h-5 w-5" />
                    {location.name}
                    {location.is_franchise && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                        <Building2 className="h-3 w-3 mr-1" />
                        Franchise
                      </Badge>
                    )}
                  </CardTitle>
                  {location.account_id && (
                    <p className="text-sm text-muted-foreground font-mono">
                      Account: {location.account_id}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant={location.is_franchise ? "default" : "outline"}
                    size="sm"
                    onClick={handleToggleFranchise}
                    className={`flex-shrink-0 ${location.is_franchise ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                    title="Toggle franchise status"
                  >
                    <Building2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startEditingLocation}
                    className="flex-shrink-0"
                    title="Edit location"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
            <Badge variant="secondary">
              {location.account_type || 'Unknown'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total Volume</span>
          <span className="font-semibold text-emerald-600">
            ${(location.totalVolume || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
        
        <div>
          <div className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Assigned Agents ({location.assignedAgents || 0})
          </div>
          <LocationAgentInlineEdit 
            locationId={location.id}
            locationName={location.name}
            onUpdate={onUpdate}
          />
        </div>

        <div>
          <AgentAssignmentDisplay location={location} />
        </div>

        {/* Notes Section */}
        <div className="pt-3 border-t border-muted">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Notes</span>
            {!editingNotes && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={startEditingNotes}
              >
                <Edit3 className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          {editingNotes ? (
            <div className="space-y-2">
              <Textarea
                value={tempNotes}
                onChange={(e) => setTempNotes(e.target.value)}
                placeholder="Add notes..."
                className="min-h-[60px] text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={handleNotesUpdate}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={cancelEditingNotes}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground min-h-[40px] p-2 bg-muted/20 rounded border">
              {location.notes || "No notes added"}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LocationCard;
