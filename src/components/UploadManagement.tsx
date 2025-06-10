import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Edit, Trash2, Search, Calendar, Upload, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LocationCleanup from "./LocationCleanup";

const UploadManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUpload, setEditingUpload] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    filename: "",
    processor: "",
    status: ""
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get count of all locations
  const { data: allLocations, isLoading: isLoadingAllLocations } = useQuery({
    queryKey: ['all-locations-count'],
    queryFn: async () => {
      console.log('Fetching all locations for count...');
      
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching all locations:', error);
        throw error;
      }
      
      console.log('Found all locations:', data);
      return data;
    }
  });

  const { data: uploads, isLoading } = useQuery({
    queryKey: ['file-uploads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('file_uploads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  const deleteAllLocationsMutation = useMutation({
    mutationFn: async () => {
      if (!allLocations || allLocations.length === 0) {
        throw new Error('No locations to delete');
      }

      const locationIds = allLocations.map(loc => loc.id);
      console.log('Deleting ALL locations with IDs:', locationIds);
      
      // Delete in batches to avoid connection issues
      const batchSize = 50;
      const batches = [];
      for (let i = 0; i < locationIds.length; i += batchSize) {
        batches.push(locationIds.slice(i, i + batchSize));
      }

      let totalDeleted = 0;

      for (const batch of batches) {
        console.log(`Processing batch of ${batch.length} locations...`);
        
        try {
          // Delete agent assignments for this batch
          const { error: assignmentError } = await supabase
            .from('location_agent_assignments')
            .delete()
            .in('location_id', batch);

          if (assignmentError) {
            console.error('Error deleting assignments for batch:', assignmentError);
            // Continue with location deletion even if assignments fail
          }

          // Delete the locations in this batch
          const { error: locationError } = await supabase
            .from('locations')
            .delete()
            .in('id', batch);

          if (locationError) {
            console.error('Error deleting locations for batch:', locationError);
            throw locationError;
          }

          totalDeleted += batch.length;
          console.log(`Successfully deleted batch. Total deleted so far: ${totalDeleted}`);

          // Small delay between batches to avoid overwhelming the database
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`Failed to delete batch:`, error);
          throw new Error(`Failed to delete batch after ${totalDeleted} successful deletions: ${error.message}`);
        }
      }

      console.log('Successfully deleted all', totalDeleted, 'locations');
      return totalDeleted;
    },
    onSuccess: (deletedCount) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['all-locations-count'] });
      queryClient.invalidateQueries({ queryKey: ['recent-locations'] });
      queryClient.invalidateQueries({ queryKey: ['numeric-locations'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      queryClient.invalidateQueries({ queryKey: ['agents-data'] });
      queryClient.invalidateQueries({ queryKey: ['commission-data'] });
      toast({
        title: "All Locations Deleted",
        description: `Successfully deleted all ${deletedCount} locations and their assignments.`,
      });
    },
    onError: (error) => {
      console.error('Delete all locations error:', error);
      toast({
        title: "Delete Failed",
        description: `Error deleting all locations: ${error.message || String(error)}`,
        variant: "destructive"
      });
    }
  });

  const deleteUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      console.log('=== STARTING COMPREHENSIVE CLOUD DELETE ===');
      const upload = uploads?.find(u => u.id === uploadId);
      if (!upload) throw new Error('Upload not found');

      console.log('Deleting upload:', upload.filename, 'Processor:', upload.processor);

      // Step 1: Get all transactions for this processor to find related locations
      const { data: transactions, error: transactionsFetchError } = await supabase
        .from('transactions')
        .select('account_id, processor')
        .eq('processor', upload.processor);

      if (transactionsFetchError) throw transactionsFetchError;

      console.log('Found transactions for processor:', transactions?.length);

      // Step 2: Get unique account IDs from transactions
      const accountIds = [...new Set(transactions?.map(t => t.account_id).filter(Boolean) || [])];
      console.log('Unique account IDs to process:', accountIds);

      // Step 3: Find locations associated with these account IDs
      let locationIds: string[] = [];
      if (accountIds.length > 0) {
        const { data: locations, error: locationsError } = await supabase
          .from('locations')
          .select('id')
          .in('account_id', accountIds);

        if (locationsError) throw locationsError;
        locationIds = locations?.map(l => l.id) || [];
        console.log('Found location IDs to clean up:', locationIds);
      }

      // Step 4: Delete location agent assignments for these locations
      if (locationIds.length > 0) {
        console.log('Deleting location agent assignments...');
        const { error: assignmentsError } = await supabase
          .from('location_agent_assignments')
          .delete()
          .in('location_id', locationIds);

        if (assignmentsError) {
          console.error('Error deleting assignments:', assignmentsError);
          throw assignmentsError;
        }
        console.log('✅ Deleted location agent assignments');
      }

      // Step 5: Delete locations associated with this processor's account IDs
      if (accountIds.length > 0) {
        console.log('Deleting locations...');
        const { error: locationsDeleteError } = await supabase
          .from('locations')
          .delete()
          .in('account_id', accountIds);

        if (locationsDeleteError) {
          console.error('Error deleting locations:', locationsDeleteError);
          throw locationsDeleteError;
        }
        console.log('✅ Deleted locations');
      }

      // Step 6: Delete all transactions for this processor
      console.log('Deleting transactions...');
      const { error: transactionError } = await supabase
        .from('transactions')
        .delete()
        .eq('processor', upload.processor);

      if (transactionError) {
        console.error('Error deleting transactions:', transactionError);
        throw transactionError;
      }
      console.log('✅ Deleted transactions');

      // Step 7: Delete P&L data for this processor
      console.log('Deleting P&L data...');
      const { error: plError } = await supabase
        .from('pl_data')
        .delete()
        .eq('processor', upload.processor);

      if (plError) {
        console.error('Error deleting P&L data:', plError);
        throw plError;
      }
      console.log('✅ Deleted P&L data');

      // Step 8: Finally delete the upload record
      console.log('Deleting upload record...');
      const { error: uploadError } = await supabase
        .from('file_uploads')
        .delete()
        .eq('id', uploadId);

      if (uploadError) {
        console.error('Error deleting upload record:', uploadError);
        throw uploadError;
      }
      console.log('✅ Deleted upload record');

      console.log('=== COMPREHENSIVE CLOUD DELETE COMPLETED ===');
      return { 
        deletedTransactions: transactions?.length || 0,
        deletedLocations: locationIds.length,
        deletedAssignments: locationIds.length,
        processor: upload.processor
      };
    },
    onSuccess: (result) => {
      // Invalidate ALL queries to ensure universal data refresh
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['agents-data'] });
      queryClient.invalidateQueries({ queryKey: ['top-agents'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-pl-data'] });
      queryClient.invalidateQueries({ queryKey: ['current-month-summary'] });
      queryClient.invalidateQueries({ queryKey: ['agent-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['numeric-locations'] });
      queryClient.invalidateQueries({ queryKey: ['commission-data'] });
      queryClient.invalidateQueries({ queryKey: ['pl-reports'] });
      
      // Clear all cache to ensure fresh data
      queryClient.clear();
      
      toast({
        title: "Complete System Cleanup",
        description: `Successfully deleted ${result.processor} processor data: ${result.deletedTransactions} transactions, ${result.deletedLocations} locations, ${result.deletedAssignments} agent assignments, and all related P&L data. All data has been removed universally from the cloud system.`,
      });
    },
    onError: (error) => {
      console.error('Comprehensive delete failed:', error);
      toast({
        title: "Delete Failed",
        description: `Error during comprehensive delete: ${String(error)}`,
        variant: "destructive"
      });
    }
  });

  const updateUploadMutation = useMutation({
    mutationFn: async (uploadData: { id: string; filename: string; processor: string; status: string }) => {
      const { error } = await supabase
        .from('file_uploads')
        .update({
          filename: uploadData.filename,
          processor: uploadData.processor,
          status: uploadData.status
        })
        .eq('id', uploadData.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      setEditingUpload(null);
      toast({
        title: "Upload Updated",
        description: "File upload has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: `Error updating upload: ${String(error)}`,
        variant: "destructive"
      });
    }
  });

  const handleEdit = (upload: any) => {
    setEditingUpload(upload);
    setEditForm({
      filename: upload.filename,
      processor: upload.processor,
      status: upload.status
    });
  };

  const handleUpdateSubmit = () => {
    if (!editingUpload) return;
    
    updateUploadMutation.mutate({
      id: editingUpload.id,
      ...editForm
    });
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'completed': 'default',
      'processing': 'secondary',
      'failed': 'destructive'
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status}
      </Badge>
    );
  };

  const filteredUploads = uploads?.filter(upload =>
    upload.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
    upload.processor.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (isLoading || isLoadingAllLocations) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Upload Management</h2>
          <p className="text-muted-foreground">Manage your file uploads</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading uploads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Cloud-Based Upload Management</h2>
          <p className="text-muted-foreground">Universal data management - deletions remove all related data across the entire system</p>
        </div>
      </div>

      {/* Location Cleanup Section */}
      <LocationCleanup />

      {/* Delete All Locations Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-red-500" />
            Complete Location Reset
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Total locations in system: {allLocations?.length || 0}
            </p>
            
            {allLocations && allLocations.length > 0 ? (
              <div className="space-y-2 mb-4">
                <p className="text-sm font-medium text-red-700">⚠️ ALL locations will be permanently deleted:</p>
                <div className="max-h-40 overflow-y-auto space-y-1 bg-red-50 p-3 rounded border border-red-200">
                  {allLocations.slice(0, 20).map((location) => (
                    <div key={location.id} className="text-xs text-red-700">
                      • {location.name} ({location.account_id || 'No Account ID'})
                    </div>
                  ))}
                  {allLocations.length > 20 && (
                    <div className="text-xs text-red-700">
                      ...and {allLocations.length - 20} more
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-green-600 mb-4">
                ✅ No locations found in the system.
              </p>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  disabled={!allLocations || allLocations.length === 0 || deleteAllLocationsMutation.isPending}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteAllLocationsMutation.isPending ? 'Deleting...' : `Delete ALL ${allLocations?.length || 0} Locations`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete ALL Locations</AlertDialogTitle>
                  <AlertDialogDescription>
                    ⚠️ <strong>COMPLETE SYSTEM RESET</strong> - This will permanently delete ALL {allLocations?.length || 0} locations in your system, regardless of when they were created or their type. This will also remove all associated agent assignments. This action cannot be undone and will give you a completely clean slate.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteAllLocationsMutation.mutate()}
                    disabled={deleteAllLocationsMutation.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {deleteAllLocationsMutation.isPending ? 'Deleting All...' : 'Delete ALL Locations'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload History - Universal Data Control
            </CardTitle>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search uploads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredUploads.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Processor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rows Processed</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUploads.map((upload) => (
                  <TableRow key={upload.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {upload.filename}
                      </div>
                    </TableCell>
                    <TableCell>{upload.processor}</TableCell>
                    <TableCell>{getStatusBadge(upload.status)}</TableCell>
                    <TableCell>{upload.rows_processed || 0}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {new Date(upload.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleEdit(upload)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Upload</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="filename">Filename</Label>
                                <Input
                                  id="filename"
                                  value={editForm.filename}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, filename: e.target.value }))}
                                />
                              </div>
                              <div>
                                <Label htmlFor="processor">Processor</Label>
                                <Select 
                                  value={editForm.processor} 
                                  onValueChange={(value) => setEditForm(prev => ({ ...prev, processor: value }))}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="TRNXN">TRNXN</SelectItem>
                                    <SelectItem value="Maverick">Maverick</SelectItem>
                                    <SelectItem value="SignaPay">SignaPay</SelectItem>
                                    <SelectItem value="Green Payments">Green Payments</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label htmlFor="status">Status</Label>
                                <Select 
                                  value={editForm.status} 
                                  onValueChange={(value) => setEditForm(prev => ({ ...prev, status: value }))}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="processing">Processing</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button 
                                onClick={handleUpdateSubmit}
                                disabled={updateUploadMutation.isPending}
                              >
                                {updateUploadMutation.isPending ? 'Updating...' : 'Update Upload'}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Universal System Delete</AlertDialogTitle>
                              <AlertDialogDescription className="space-y-2">
                                <p className="font-semibold text-red-600">⚠️ COMPREHENSIVE CLOUD DELETE</p>
                                <p>This will permanently delete ALL data associated with the <strong>{upload.processor}</strong> processor:</p>
                                <ul className="list-disc list-inside space-y-1 text-sm">
                                  <li>All transaction records</li>
                                  <li>All associated locations</li>
                                  <li>All agent assignments</li>
                                  <li>All P&L data</li>
                                  <li>The upload record itself</li>
                                </ul>
                                <p className="text-red-600 font-medium">This action cannot be undone and will affect the entire system universally.</p>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUploadMutation.mutate(upload.id)}
                                disabled={deleteUploadMutation.isPending}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                {deleteUploadMutation.isPending ? 'Deleting All Data...' : 'Delete Everything'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">
                {searchTerm ? 'No uploads found matching your search.' : 'No uploads found. Upload some files to get started.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground bg-red-50 border border-red-200 rounded-lg p-3">
        <p className="font-medium mb-2 text-red-800">🔥 CLOUD-BASED UNIVERSAL DELETE:</p>
        <ul className="space-y-1 text-red-700">
          <li><strong>✅ COMPREHENSIVE:</strong> Deletes transactions, locations, assignments, and P&L data</li>
          <li><strong>✅ UNIVERSAL:</strong> Removes data across the entire cloud system</li>
          <li><strong>✅ CACHE CLEARING:</strong> Refreshes all application data automatically</li>
          <li><strong>⚠️ PERMANENT:</strong> Cannot be undone - use with caution</li>
        </ul>
      </div>
    </div>
  );
};

export default UploadManagement;
