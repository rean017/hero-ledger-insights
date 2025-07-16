
import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, Calendar, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { analyzeFile, FileAnalysisResult } from "@/utils/fileAnalyzer";
import { format } from "date-fns";

const SmartFileUpload = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedProcessor, setSelectedProcessor] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [analysis, setAnalysis] = useState<FileAnalysisResult | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('📁 SMART UPLOAD: File selected:', file.name);
    setSelectedFile(file);
    setIsAnalyzing(true);

    try {
      const analysisResult = await analyzeFile(file);
      setAnalysis(analysisResult);
      
      // Auto-select processor if confidence is high
      if (analysisResult.confidence > 70) {
        setSelectedProcessor(analysisResult.suggestedProcessor);
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
    if (!selectedFile || !selectedProcessor) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Here you would implement the actual file upload logic
      // For now, we'll simulate the upload
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      clearInterval(progressInterval);
      setUploadProgress(100);

      toast({
        title: "Upload Successful",
        description: `File processed successfully with ${selectedProcessor} processor`
      });

      // Reset form
      setSelectedFile(null);
      setSelectedProcessor("");
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Smart File Upload</h2>
        <p className="text-muted-foreground">
          Upload your transaction files with automatic processor detection and date range analysis
        </p>
      </div>

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

              <div className="space-y-2">
                <label className="text-sm font-medium">Select Processor</label>
                <Select value={selectedProcessor} onValueChange={setSelectedProcessor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose processor type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRNXN">TRNXN</SelectItem>
                    <SelectItem value="NUVEI">NUVEI</SelectItem>
                    <SelectItem value="PAYSAFE">PAYSAFE</SelectItem>
                    <SelectItem value="Generic">Generic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="w-full" />
                </div>
              )}

              <Button
                onClick={handleUpload}
                disabled={!selectedProcessor || isAnalyzing || isUploading}
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
