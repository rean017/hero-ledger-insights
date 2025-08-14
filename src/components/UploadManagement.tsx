import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, FileText, Calendar, Hash, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface Upload {
  id: string;
  original_filename: string;
  row_count: number;
  month: string;
  created_at: string;
  facts_count?: number;
}

export const UploadManagement = () => {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchUploads = async () => {
    try {
      setLoading(true);
      
      // Get upload data from new stable schema - uploads table
      const { data: uploadData, error: uploadError } = await supabase
        .from('uploads')
        .select('id, original_filename, row_count, month, created_at')
        .order('created_at', { ascending: false });

      if (uploadError) throw uploadError;

      // Get facts count for each upload from facts_monthly_location table
      const uploadsWithCounts = await Promise.all(
        uploadData.map(async (upload) => {
          const { count, error } = await supabase
            .from('facts_monthly_location')
            .select('*', { count: 'exact', head: true })
            .eq('upload_id', upload.id);

          if (error) {
            console.error('Error counting facts:', error);
          }

          return {
            ...upload,
            facts_count: count || 0
          };
        })
      );

      setUploads(uploadsWithCounts);
    } catch (error) {
      console.error('Error fetching uploads:', error);
      toast({
        title: "Error",
        description: "Failed to load uploads",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteUpload = async (uploadId: string) => {
    try {
      setDeletingId(uploadId);

      // Delete facts first, then upload (using new stable schema)
      const { error: factsError } = await supabase
        .from('facts_monthly_location')
        .delete()
        .eq('upload_id', uploadId);

      if (factsError) throw factsError;

      const { error: uploadError } = await supabase
        .from('uploads')
        .delete()
        .eq('id', uploadId);

      if (uploadError) throw uploadError;

      toast({
        title: "Upload Deleted",
        description: "Upload and all associated data have been removed"
      });

      // Refresh the list
      fetchUploads();
    } catch (error) {
      console.error('Error deleting upload:', error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete upload",
        variant: "destructive"
      });
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    fetchUploads();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatMonth = (month: string) => {
    try {
      // Handle date strings like "2025-06-01" by extracting year and month
      const dateMatch = month.match(/^(\d{4})-(\d{2})-?\d*$/);
      if (dateMatch) {
        const [, year, monthNum] = dateMatch;
        // Create date using local timezone to avoid timezone issues
        const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        return format(date, 'MMMM yyyy');
      }
      return format(new Date(month), 'MMMM yyyy');
    } catch {
      return month;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Upload Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <div className="text-muted-foreground">Loading uploads...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Upload Management
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          View and manage your uploaded commission data files
        </p>
      </CardHeader>
      <CardContent>
        {uploads.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">No uploads found</p>
            <p className="text-sm text-muted-foreground">
              Upload your first commission data file to get started
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {uploads.length} upload{uploads.length !== 1 ? 's' : ''} found
              </p>
              <Button variant="outline" onClick={fetchUploads} size="sm">
                Refresh
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploads.map((upload) => (
                    <TableRow key={upload.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{upload.original_filename}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {formatMonth(upload.month)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Hash className="h-4 w-4 text-muted-foreground" />
                          {upload.row_count.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="secondary">
                            {upload.facts_count?.toLocaleString() || 0}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(upload.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={deletingId === upload.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Upload</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this upload?
                                <br />
                                <br />
                                <strong>File:</strong> {upload.original_filename}
                                <br />
                                <strong>Month:</strong> {formatMonth(upload.month)}
                                <br />
                                <strong>Records:</strong> {upload.facts_count?.toLocaleString() || 0}
                                <br />
                                <br />
                                This action cannot be undone. All associated commission data will be permanently removed.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUpload(upload.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Upload
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};