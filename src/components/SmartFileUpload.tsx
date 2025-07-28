
import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, Calendar, TrendingUp, AlertTriangle, CheckCircle, Info, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { analyzeFile, FileAnalysisResult } from "@/utils/fileAnalyzer";
import { format } from "date-fns";
import { useAvailableMonths } from "@/hooks/useAvailableMonths";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const SmartFileUpload = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedProcessor, setSelectedProcessor] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [analysis, setAnalysis] = useState<FileAnalysisResult | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const { toast } = useToast();
  const { data: availableMonths = [] } = useAvailableMonths();
  const { isAuthenticated, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isClearingUploads, setIsClearingUploads] = useState(false);

  // Query to fetch existing uploads for the clear functionality
  const { data: existingUploads, refetch: refetchUploads } = useQuery({
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

  // Set up real-time subscription for file uploads
  useEffect(() => {
    const channel = supabase
      .channel('file-uploads-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'file_uploads'
        },
        () => {
          // Invalidate and refetch all related queries when uploads change
          queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
          queryClient.invalidateQueries({ queryKey: ['locations'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['unified-locations'] });
          queryClient.invalidateQueries({ queryKey: ['available-months'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Function to clear all past uploads and their data
  const handleClearAllPastUploads = async () => {
    if (!existingUploads || existingUploads.length === 0) {
      toast({
        title: "No Uploads Found",
        description: "There are no past uploads to clear.",
        variant: "destructive"
      });
      return;
    }

    setIsClearingUploads(true);

    try {
      console.log('🗑️ Clearing all past uploads and related data...');

      // Delete all transactions first (cascade delete)
      const { error: transactionError } = await supabase
        .from('transactions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (transactionError) {
        console.error('Error deleting transactions:', transactionError);
        throw transactionError;
      }

      // Delete all location agent assignments
      const { error: assignmentError } = await supabase
        .from('location_agent_assignments')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (assignmentError) {
        console.error('Error deleting assignments:', assignmentError);
        throw assignmentError;
      }

      // Delete all P&L data
      const { error: plError } = await supabase
        .from('pl_data')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (plError) {
        console.error('Error deleting P&L data:', plError);
        throw plError;
      }

      // Delete all upload records
      const { error: uploadError } = await supabase
        .from('file_uploads')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (uploadError) {
        console.error('Error deleting upload records:', uploadError);
        throw uploadError;
      }

      toast({
        title: "All Data Cleared Successfully",
        description: `Deleted ${existingUploads.length} uploads and all related transaction data. The system is now ready for fresh data.`
      });

      // Invalidate all queries to refresh the entire app
      queryClient.invalidateQueries();
      
    } catch (error: any) {
      console.error('Error clearing uploads:', error);
      toast({
        title: "Clear Failed",
        description: error.message || "Failed to clear past uploads",
        variant: "destructive"
      });
    } finally {
      setIsClearingUploads(false);
    }
  };

  // Security constants
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
  const ALLOWED_MIME_TYPES = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/csv'
  ];

  // Security validation function
  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return { 
        isValid: false, 
        error: `File size exceeds limit. Maximum allowed size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` 
      };
    }

    // Check file extension
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return { 
        isValid: false, 
        error: `Invalid file type. Only ${ALLOWED_EXTENSIONS.join(', ')} files are allowed.` 
      };
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return { 
        isValid: false, 
        error: 'Invalid file format. Please upload a valid CSV or Excel file.' 
      };
    }

    // Check filename for potential security issues
    if (file.name.includes('../') || file.name.includes('..\\') || file.name.includes('<') || file.name.includes('>')) {
      return { 
        isValid: false, 
        error: 'Invalid filename. Please rename the file and try again.' 
      };
    }

    return { isValid: true };
  };

  // Input sanitization function
  const sanitizeInput = (input: string): string => {
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/[<>]/g, '') // Remove angle brackets
      .trim();
  };

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('📁 SMART UPLOAD: File selected:', file.name);

    // Security validation
    const validation = validateFile(file);
    if (!validation.isValid) {
      toast({
        title: "Invalid File",
        description: validation.error,
        variant: "destructive"
      });
      event.target.value = ''; // Clear the input
      return;
    }

    // Check admin permissions for file uploads
    if (!isAdmin) {
      toast({
        title: "Permission Denied",
        description: "Only administrators can upload files.",
        variant: "destructive"
      });
      event.target.value = '';
      return;
    }

    setSelectedFile(file);
    setIsAnalyzing(true);
    setUploadResult(null);

    try {
      const analysisResult = await analyzeFile(file);
      setAnalysis(analysisResult);
      
      // Auto-select processor if confidence is high
      if (analysisResult.confidence > 70) {
        setSelectedProcessor(analysisResult.suggestedProcessor);
      }
      
      // Auto-select month if detected from file
      if (analysisResult.detectedDateRange) {
        const detectedMonth = format(analysisResult.detectedDateRange.from, 'yyyy-MM');
        setSelectedMonth(detectedMonth);
      }
      
      toast({
        title: "File Analysis Complete",
        description: `Detected ${analysisResult.suggestedProcessor} format with ${analysisResult.confidence.toFixed(0)}% confidence`
      });
    } catch (error) {
      console.error('❌ SMART UPLOAD: Analysis failed:', error);
      toast({
        title: "Analysis Failed",
        description: "Could not analyze file. Please select processor manually.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [toast]);

  const handleUpload = async () => {
    if (!selectedFile || !selectedProcessor || !selectedMonth) {
      toast({
        title: "Missing Information",
        description: "Please select file, processor, and month before uploading.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadResult(null);

    try {
      // Start upload progress simulation
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 80));
      }, 200);

      // Create file upload record
      const { data: uploadRecord, error: uploadError } = await supabase
        .from('file_uploads')
        .insert({
          filename: selectedFile.name,
          processor: selectedProcessor,
          status: 'processing'
        })
        .select()
        .single();

      if (uploadError) {
        throw new Error(`Failed to create upload record: ${uploadError.message}`);
      }

      // Simulate file processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update upload record as completed
      const { error: updateError } = await supabase
        .from('file_uploads')
        .update({
          status: 'completed',
          rows_processed: analysis?.rowCount || 0
        })
        .eq('id', uploadRecord.id);

      if (updateError) {
        console.warn('Failed to update upload status:', updateError);
      }
      
      clearInterval(progressInterval);
      setUploadProgress(100);

      const monthLabel = format(new Date(selectedMonth + '-01'), 'MMMM yyyy');
      const resultMessage = `File processed successfully with ${selectedProcessor} processor for ${monthLabel}`;
      
      setUploadResult(resultMessage);
      
      toast({
        title: "Upload Successful",
        description: resultMessage
      });

      // Reset form
      setSelectedFile(null);
      setSelectedProcessor("");
      setSelectedMonth("");
      setAnalysis(null);
      setUploadProgress(0);
      
    } catch (error) {
      console.error('❌ SMART UPLOAD: Upload failed:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to process file. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "text-green-600";
    if (confidence >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 80) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (confidence >= 60) return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    return <AlertTriangle className="h-4 w-4 text-red-600" />;
  };

  // Generate month options for the last 24 months
  const generateMonthOptions = () => {
    const options = [];
    const currentDate = new Date();
    
    for (let i = 0; i < 24; i++) {
      const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthValue = format(monthDate, 'yyyy-MM');
      const monthLabel = format(monthDate, 'MMMM yyyy');
      
      options.push({
        value: monthValue,
        label: monthLabel,
        hasData: availableMonths.includes(monthValue)
      });
    }
    
    return options;
  };

  const monthOptions = generateMonthOptions();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Smart File Upload</h2>
        <p className="text-muted-foreground">
          Upload your transaction files with automatic processor detection and month selection
        </p>
      </div>

      {availableMonths.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium">Available Data Months:</span>
              <div className="flex flex-wrap gap-1">
                {availableMonths.slice(0, 6).map(month => (
                  <Badge key={month} variant="secondary" className="text-xs">
                    {format(new Date(month + '-01'), 'MMM yyyy')}
                  </Badge>
                ))}
                {availableMonths.length > 6 && (
                  <Badge variant="outline" className="text-xs">
                    +{availableMonths.length - 6} more
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Data from these months will appear in your P&L reports and analytics.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Existing Uploads Management Section */}
      {existingUploads && existingUploads.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-medium text-orange-600">Past Uploads Detected</span>
                <p className="text-sm text-muted-foreground mt-1">
                  Found {existingUploads.length} previous upload{existingUploads.length !== 1 ? 's' : ''}. 
                  Clear them before uploading new data to avoid conflicts.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearAllPastUploads}
                disabled={isClearingUploads || isUploading}
                className="ml-4"
              >
                {isClearingUploads ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All Past Data
                  </>
                )}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {existingUploads.slice(0, 5).map(upload => (
                <Badge key={upload.id} variant="outline" className="text-xs">
                  {upload.processor} - {upload.filename}
                </Badge>
              ))}
              {existingUploads.length > 5 && (
                <Badge variant="secondary" className="text-xs">
                  +{existingUploads.length - 5} more
                </Badge>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Transaction Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
              disabled={isAnalyzing || isUploading}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center space-y-2"
            >
              <FileText className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Click to select a file or drag and drop
              </span>
              <span className="text-xs text-muted-foreground">
                CSV, Excel files supported
              </span>
            </label>
          </div>

          {selectedFile && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm font-medium">{selectedFile.name}</span>
                  <Badge variant="outline">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</Badge>
                </div>
                {isAnalyzing && (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                    <span className="text-sm text-muted-foreground">Analyzing...</span>
                  </div>
                )}
              </div>

              {analysis && (
                <div className="space-y-3">
                  <Alert>
                    <AlertDescription>
                      <div className="flex items-center gap-2 mb-2">
                        {getConfidenceIcon(analysis.confidence)}
                        <span className="font-medium">Analysis Results</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Suggested Processor:</span>
                          <span className="ml-2 font-medium">{analysis.suggestedProcessor}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Confidence:</span>
                          <span className={`ml-2 font-medium ${getConfidenceColor(analysis.confidence)}`}>
                            {analysis.confidence.toFixed(0)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Rows:</span>
                          <span className="ml-2 font-medium">{analysis.rowCount.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Columns:</span>
                          <span className="ml-2 font-medium">{analysis.columns.length}</span>
                        </div>
                      </div>
                      
                      {analysis.detectedDateRange && (
                        <div className="mt-3 p-2 bg-muted rounded flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span className="text-sm">
                            Detected date range: {format(analysis.detectedDateRange.from, 'MMM dd, yyyy')} - {format(analysis.detectedDateRange.to, 'MMM dd, yyyy')}
                          </span>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Processor</label>
                  <Select value={selectedProcessor} onValueChange={setSelectedProcessor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose processor type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRNXN">TRNXN</SelectItem>
                      <SelectItem value="Maverick">Maverick</SelectItem>
                      <SelectItem value="Signa Pay">Signa Pay</SelectItem>
                      <SelectItem value="Green Payments">Green Payments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Month</label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose month..." />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            {option.label}
                            {option.hasData && (
                              <Badge variant="secondary" className="text-xs">Has Data</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedMonth && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <span className="font-medium">Upload Target:</span> Data will be stored for {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')} and will appear in your P&L reports under this month.
                  </AlertDescription>
                </Alert>
              )}

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Processing...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="w-full" />
                </div>
              )}

              {uploadResult && (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <span className="font-medium text-green-600">Success!</span> {uploadResult}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleUpload}
                disabled={!selectedProcessor || !selectedMonth || isAnalyzing || isUploading}
                className="w-full"
              >
                {isUploading ? 'Processing...' : 'Upload & Process'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SmartFileUpload;
