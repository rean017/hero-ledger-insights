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
import { FileText, Edit, Trash2, Search, Calendar, Upload } from "lucide-react";
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

  const deleteUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      // First delete related transactions
      const { error: transactionError } = await supabase
        .from('transactions')
        .delete()
        .eq('processor', uploads?.find(u => u.id === uploadId)?.processor || '');

      if (transactionError) throw transactionError;

      // Then delete the upload record
      const { error } = await supabase
        .from('file_uploads')
        .delete()
        .eq('id', uploadId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
      queryClient.invalidateQueries({ queryKey: ['agents-data'] });
      toast({
        title: "Upload Deleted",
        description: "File upload and related data have been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: `Error deleting upload: ${String(error)}`,
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

  if (isLoading) {
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
          <h2 className="text-2xl font-bold text-foreground mb-2">Upload Management</h2>
          <p className="text-muted-foreground">View, edit, and delete your file uploads</p>
        </div>
      </div>

      {/* Location Cleanup Section */}
      <LocationCleanup />

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload History
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
                              <AlertDialogTitle>Delete Upload</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this upload? This will also delete all associated transaction data. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUploadMutation.mutate(upload.id)}
                                disabled={deleteUploadMutation.isPending}
                              >
                                {deleteUploadMutation.isPending ? 'Deleting...' : 'Delete'}
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
    </div>
  );
};

export default UploadManagement;
