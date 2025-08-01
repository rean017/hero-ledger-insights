import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { FileText, Trash2, Calendar, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface FileUpload {
  id: string;
  filename: string;
  processor: string;
  rows_processed: number;
  status: string;
  created_at: string;
}

export default function UploadManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: uploads, isLoading } = useQuery({
    queryKey: ['file-uploads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('file_uploads')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as FileUpload[];
    }
  });

  const deleteUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      // First, delete associated transactions
      const { error: transactionsError } = await supabase
        .from('transactions')
        .delete()
        .eq('raw_data->>upload_id', uploadId);

      if (transactionsError) throw transactionsError;

      // Then delete the file upload record
      const { error: uploadError } = await supabase
        .from('file_uploads')
        .delete()
        .eq('id', uploadId);

      if (uploadError) throw uploadError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      queryClient.invalidateQueries({ queryKey: ['system-data'] });
      toast({
        title: "Upload deleted",
        description: "The upload and all associated data have been removed."
      });
    },
    onError: (error) => {
      console.error('Delete error:', error);
      toast({
        title: "Delete failed",
        description: "There was an error deleting the upload.",
        variant: "destructive"
      });
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Upload Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>Loading uploads...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Upload Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!uploads || uploads.length === 0 ? (
            <p className="text-muted-foreground">No uploads found.</p>
          ) : (
            <div className="space-y-4">
              {uploads.map((upload) => (
                <div key={upload.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">{upload.filename}</h3>
                      <p className="text-sm text-muted-foreground">
                        {upload.processor} • {upload.rows_processed} rows • {upload.status}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(upload.created_at), 'MMM dd, yyyy HH:mm')}
                      </p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Upload</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the upload "{upload.filename}" and all associated transaction data. 
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteUploadMutation.mutate(upload.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}