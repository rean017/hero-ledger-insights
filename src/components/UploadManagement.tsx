import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, FileText, AlertCircle, CheckCircle, Calendar, Download } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const UploadManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Set up real-time subscription for file uploads
  useEffect(() => {
    const channel = supabase
      .channel('upload-management-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'file_uploads'
        },
        () => {
          // Refetch uploads when any changes occur
          queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        () => {
          // Refetch when transactions change (affects row counts, etc.)
          queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: uploads, refetch } = useQuery({
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

  const handleDeleteUpload = async (uploadId: string, processor: string) => {
    try {
      console.log(`🗑️ Deleting upload ${uploadId} with cascade deletion for processor: ${processor}`);
      
      // Delete all transactions for this processor (this will cascade to related data)
      const { error: transactionError } = await supabase
        .from('transactions')
        .delete()
        .eq('processor', processor);

      if (transactionError) {
        console.error('Error deleting transactions:', transactionError);
        throw transactionError;
      }

      // Delete the upload record
      const { error: uploadError } = await supabase
        .from('file_uploads')
        .delete()
        .eq('id', uploadId);

      if (uploadError) {
        console.error('Error deleting upload record:', uploadError);
        throw uploadError;
      }

      toast({
        title: "Upload Deleted",
        description: `Successfully deleted ${processor} upload and all related transaction data`
      });

      // Invalidate all related queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['unified-locations'] });
      
      refetch();
    } catch (error: any) {
      console.error('Error deleting upload:', error);
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete upload",
        variant: "destructive"
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'processing':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Upload Management</h2>
        <p className="text-muted-foreground">
          Manage your uploaded files and their processing status. Deleting an upload will remove all related transaction data and recalculate commissions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Upload History with Cascade Deletion
          </CardTitle>
        </CardHeader>
        <CardContent>
          {uploads && uploads.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Processor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rows Processed</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((upload) => (
                  <TableRow key={upload.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      {getStatusIcon(upload.status)}
                      {upload.filename}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{upload.processor}</Badge>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(upload.status)}
                    </TableCell>
                    <TableCell>
                      {upload.rows_processed || 0} rows
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(upload.created_at), 'MMM dd, yyyy HH:mm')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteUpload(upload.id, upload.processor)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No uploads found. Upload your first file to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {uploads && uploads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {uploads.filter(u => u.status === 'completed').length}
                </div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {uploads.filter(u => u.status === 'failed').length}
                </div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {uploads.filter(u => u.status === 'processing').length}
                </div>
                <div className="text-sm text-muted-foreground">Processing</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {uploads.reduce((sum, u) => sum + (u.rows_processed || 0), 0)}
                </div>
                <div className="text-sm text-muted-foreground">Total Rows</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default UploadManagement;
