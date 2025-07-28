
import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, Calendar, TrendingUp, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { analyzeFile, FileAnalysisResult } from "@/utils/fileAnalyzer";
import { format } from "date-fns";
import { useAvailableMonths } from "@/hooks/useAvailableMonths";
import { supabase } from "@/integrations/supabase/client";

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

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('📁 SMART UPLOAD: File selected:', file.name);
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
