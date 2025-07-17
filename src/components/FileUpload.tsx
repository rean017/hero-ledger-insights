
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileText, CheckCircle, AlertCircle, Eye, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { validateTransactionData } from "@/utils/dataValidation";

interface ParsedData {
  dbaName: string;
  volume: number;
  agentPayout: number;
  transactionDate: string;
  rawData: any;
}

interface DataPreview {
  headers: string[];
  rows: any[][];
  parsedData: ParsedData[];
}

const FileUpload = () => {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [dataPreview, setDataPreview] = useState<DataPreview | null>(null);
  const [selectedProcessor, setSelectedProcessor] = useState<string>('Maverick');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const processors = [
    { value: 'TRNXN', label: 'TRNXN' },
    { value: 'Maverick', label: 'Maverick' },
    { value: 'SignaPay', label: 'SignaPay' },
    { value: 'Green Payments', label: 'Green Payments' },
    { value: 'NUVEI', label: 'NUVEI' },
    { value: 'PAYSAFE', label: 'PAYSAFE' },
    { value: 'Generic', label: 'Generic' }
  ];

  // Enhanced field detection for volume
  const detectVolumeField = (headers: string[]): string | null => {
    const volumePatterns = [
      /volume/i,
      /total.*volume/i,
      /gross.*volume/i,
      /transaction.*volume/i,
      /monthly.*volume/i,
      /sales.*volume/i,
      /amount/i,
      /total.*amount/i,
      /gross.*amount/i,
      /transaction.*amount/i,
      /monthly.*amount/i,
      /sales.*amount/i,
      /revenue/i,
      /total.*revenue/i,
      /gross.*revenue/i,
      /monthly.*revenue/i,
      /sales.*revenue/i,
      /total/i,
      /gross/i,
      /net/i,
      /monthly.*total/i,
      /ytd.*volume/i,
      /ytd.*amount/i,
      /ytd.*total/i
    ];

    console.log('🔍 VOLUME DETECTION: Available headers:', headers);
    
    for (const pattern of volumePatterns) {
      const match = headers.find(header => pattern.test(header));
      if (match) {
        console.log('✅ VOLUME DETECTION: Found volume field:', match, 'using pattern:', pattern);
        return match;
      }
    }
    
    console.log('❌ VOLUME DETECTION: No volume field found');
    return null;
  };

  // Enhanced field detection for agent payout
  const detectAgentPayoutField = (headers: string[]): string | null => {
    const payoutPatterns = [
      /agent.*payout/i,
      /payout/i,
      /commission/i,
      /agent.*commission/i,
      /agent.*fee/i,
      /fee/i,
      /earnings/i,
      /agent.*earnings/i,
      /payment/i,
      /agent.*payment/i,
      /compensation/i,
      /agent.*compensation/i,
      /bonus/i,
      /agent.*bonus/i,
      /incentive/i,
      /agent.*incentive/i,
      /residual/i,
      /agent.*residual/i,
      /override/i,
      /agent.*override/i,
      /split/i,
      /agent.*split/i,
      /share/i,
      /agent.*share/i
    ];

    console.log('🔍 PAYOUT DETECTION: Available headers:', headers);
    
    for (const pattern of payoutPatterns) {
      const match = headers.find(header => pattern.test(header));
      if (match) {
        console.log('✅ PAYOUT DETECTION: Found payout field:', match, 'using pattern:', pattern);
        return match;
      }
    }
    
    console.log('❌ PAYOUT DETECTION: No payout field found');
    return null;
  };

  // Enhanced field detection for DBA name
  const detectDBAField = (headers: string[]): string | null => {
    const dbaPatterns = [
      /dba/i,
      /business.*name/i,
      /merchant.*name/i,
      /company.*name/i,
      /store.*name/i,
      /location.*name/i,
      /client.*name/i,
      /account.*name/i,
      /name/i,
      /business/i,
      /merchant/i,
      /company/i,
      /store/i,
      /location/i,
      /client/i,
      /account/i
    ];

    console.log('🔍 DBA DETECTION: Available headers:', headers);
    
    for (const pattern of dbaPatterns) {
      const match = headers.find(header => pattern.test(header));
      if (match) {
        console.log('✅ DBA DETECTION: Found DBA field:', match, 'using pattern:', pattern);
        return match;
      }
    }
    
    console.log('❌ DBA DETECTION: No DBA field found');
    return null;
  };

  // Enhanced field detection for transaction date
  const detectDateField = (headers: string[]): string | null => {
    const datePatterns = [
      /date/i,
      /transaction.*date/i,
      /month/i,
      /period/i,
      /reporting.*date/i,
      /statement.*date/i,
      /processing.*date/i,
      /created.*date/i,
      /effective.*date/i,
      /settlement.*date/i,
      /batch.*date/i,
      /posting.*date/i,
      /time/i,
      /timestamp/i,
      /created.*at/i,
      /updated.*at/i,
      /processed.*at/i
    ];

    console.log('🔍 DATE DETECTION: Available headers:', headers);
    
    for (const pattern of datePatterns) {
      const match = headers.find(header => pattern.test(header));
      if (match) {
        console.log('✅ DATE DETECTION: Found date field:', match, 'using pattern:', pattern);
        return match;
      }
    }
    
    console.log('❌ DATE DETECTION: No date field found');
    return null;
  };

  // Smart data parsing with better number handling
  const parseNumericValue = (value: any): number => {
    if (typeof value === 'number') {
      return value;
    }
    
    if (typeof value === 'string') {
      // Remove currency symbols, commas, and other formatting
      const cleaned = value.replace(/[$,\s%]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    }
    
    return 0;
  };

  const parseDate = (value: any): string => {
    if (!value) return new Date().toISOString().split('T')[0];
    
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return new Date().toISOString().split('T')[0];
      }
      return date.toISOString().split('T')[0];
    } catch (error) {
      return new Date().toISOString().split('T')[0];
    }
  };

  const parseFileData = (data: any[], headers: string[]): ParsedData[] => {
    console.log('🔄 PARSING: Starting data parsing with', data.length, 'rows');
    console.log('🔄 PARSING: Headers:', headers);
    
    const dbaField = detectDBAField(headers);
    const volumeField = detectVolumeField(headers);
    const payoutField = detectAgentPayoutField(headers);
    const dateField = detectDateField(headers);
    
    console.log('🔄 PARSING: Detected fields:', {
      dbaField,
      volumeField,
      payoutField,
      dateField
    });
    
    const parsedData: ParsedData[] = [];
    
    data.forEach((row, index) => {
      // Skip empty rows
      if (!row || Object.keys(row).length === 0) {
        console.log(`⏭️ PARSING: Skipping empty row ${index}`);
        return;
      }
      
      const dbaName = dbaField ? String(row[dbaField] || '').trim() : `Unknown Location ${index + 1}`;
      const volume = volumeField ? parseNumericValue(row[volumeField]) : 0;
      const agentPayout = payoutField ? parseNumericValue(row[payoutField]) : 0;
      const transactionDate = dateField ? parseDate(row[dateField]) : new Date().toISOString().split('T')[0];
      
      console.log(`📊 PARSING: Row ${index + 1}:`, {
        dbaName,
        volume,
        agentPayout,
        transactionDate,
        rawValues: {
          dba: dbaField ? row[dbaField] : 'N/A',
          volume: volumeField ? row[volumeField] : 'N/A',
          payout: payoutField ? row[payoutField] : 'N/A',
          date: dateField ? row[dateField] : 'N/A'
        }
      });
      
      if (dbaName && dbaName !== 'Unknown Location ' + (index + 1)) {
        parsedData.push({
          dbaName,
          volume,
          agentPayout,
          transactionDate,
          rawData: row
        });
      }
    });
    
    console.log('✅ PARSING: Successfully parsed', parsedData.length, 'valid rows');
    return parsedData;
  };

  const handleFileRead = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        let parsedData: any[] = [];
        let headers: string[] = [];
        
        if (file.name.endsWith('.csv')) {
          const result = Papa.parse(data as string, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim()
          });
          parsedData = result.data;
          headers = result.meta.fields || [];
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (jsonData.length > 0) {
            headers = (jsonData[0] as string[]).map(h => String(h).trim());
            const dataRows = jsonData.slice(1);
            parsedData = dataRows.map(row => {
              const obj: any = {};
              headers.forEach((header, index) => {
                obj[header] = (row as any[])[index];
              });
              return obj;
            });
          }
        }
        
        console.log('📁 FILE READ: Raw data sample:', parsedData.slice(0, 3));
        console.log('📁 FILE READ: Headers found:', headers);
        
        const processedData = parseFileData(parsedData, headers);
        
        setDataPreview({
          headers,
          rows: parsedData.slice(0, 10).map(row => headers.map(h => row[h])),
          parsedData: processedData
        });
        
        console.log('📊 PREVIEW: Generated preview with', processedData.length, 'processed rows');
        
      } catch (error) {
        console.error('❌ FILE READ ERROR:', error);
        toast({
          title: "File parsing error",
          description: "Unable to parse the uploaded file. Please check the file format.",
          variant: "destructive"
        });
      }
    };
    
    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file) {
        handleFileRead(file);
      }
    },
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false
  });

  const handleUpload = async () => {
    if (!dataPreview?.parsedData || dataPreview.parsedData.length === 0) {
      toast({
        title: "No data to upload",
        description: "Please select a file and review the data preview first.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadResult(null);

    try {
      console.log('🚀 UPLOAD: Starting upload process with', dataPreview.parsedData.length, 'records');
      console.log('🚀 UPLOAD: Selected processor:', selectedProcessor);

      // Validate data before upload
      const validation = validateTransactionData(dataPreview.parsedData);
      if (!validation.isValid) {
        throw new Error(`Data validation failed: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        console.log('⚠️ UPLOAD: Validation warnings:', validation.warnings);
      }

      // Create upload record
      const { data: uploadRecord, error: uploadError } = await supabase
        .from('file_uploads')
        .insert({
          filename: `${selectedProcessor}_upload_${new Date().toISOString()}`,
          processor: selectedProcessor,
          status: 'processing',
          rows_processed: 0
        })
        .select()
        .single();

      if (uploadError) {
        console.error('❌ UPLOAD: Error creating upload record:', uploadError);
        throw uploadError;
      }

      console.log('✅ UPLOAD: Created upload record:', uploadRecord.id);

      // Process each row
      const processedRows = [];
      const errors = [];

      for (let i = 0; i < dataPreview.parsedData.length; i++) {
        const row = dataPreview.parsedData[i];
        setUploadProgress(((i + 1) / dataPreview.parsedData.length) * 100);

        try {
          console.log(`🔄 UPLOAD: Processing row ${i + 1}/${dataPreview.parsedData.length}:`, {
            dbaName: row.dbaName,
            volume: row.volume,
            agentPayout: row.agentPayout,
            transactionDate: row.transactionDate
          });

          // Find or create location
          let location = null;
          if (row.dbaName && row.dbaName.trim() !== '') {
            const { data: existingLocation } = await supabase
              .from('locations')
              .select('*')
              .ilike('name', row.dbaName.trim())
              .single();

            if (existingLocation) {
              location = existingLocation;
              console.log(`📍 UPLOAD: Found existing location:`, location.name);
            } else {
              const { data: newLocation, error: locationError } = await supabase
                .from('locations')
                .insert({
                  name: row.dbaName.trim(),
                  account_type: 'Auto-Created'
                })
                .select()
                .single();

              if (locationError) {
                console.error('❌ UPLOAD: Error creating location:', locationError);
                errors.push(`Row ${i + 1}: Failed to create location - ${locationError.message}`);
                continue;
              }

              location = newLocation;
              console.log(`📍 UPLOAD: Created new location:`, location.name);
            }
          }

          // Insert transaction
          const transactionData = {
            processor: selectedProcessor,
            volume: row.volume || 0,
            agent_payout: row.agentPayout || 0,
            transaction_date: row.transactionDate,
            location_id: location?.id || null,
            raw_data: row.rawData
          };

          console.log(`💾 UPLOAD: Inserting transaction:`, transactionData);

          const { error: transactionError } = await supabase
            .from('transactions')
            .insert(transactionData);

          if (transactionError) {
            console.error('❌ UPLOAD: Transaction insert error:', transactionError);
            errors.push(`Row ${i + 1}: Failed to insert transaction - ${transactionError.message}`);
            continue;
          }

          processedRows.push(row);
          console.log(`✅ UPLOAD: Successfully processed row ${i + 1}`);

        } catch (error: any) {
          console.error(`❌ UPLOAD: Error processing row ${i + 1}:`, error);
          errors.push(`Row ${i + 1}: ${error.message}`);
        }
      }

      // Update upload record
      const { error: updateError } = await supabase
        .from('file_uploads')
        .update({
          status: errors.length > 0 ? 'completed_with_errors' : 'completed',
          rows_processed: processedRows.length,
          errors: errors.length > 0 ? errors : null
        })
        .eq('id', uploadRecord.id);

      if (updateError) {
        console.error('❌ UPLOAD: Error updating upload record:', updateError);
      }

      setUploadResult({
        success: true,
        processedRows: processedRows.length,
        totalRows: dataPreview.parsedData.length,
        errors: errors,
        processor: selectedProcessor
      });

      console.log('🎉 UPLOAD: Upload completed successfully!', {
        processedRows: processedRows.length,
        totalRows: dataPreview.parsedData.length,
        errors: errors.length
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['available-months'] });

      toast({
        title: "Upload completed",
        description: `Successfully processed ${processedRows.length} of ${dataPreview.parsedData.length} rows`
      });

    } catch (error: any) {
      console.error('❌ UPLOAD: Fatal error:', error);
      setUploadResult({
        success: false,
        error: error.message,
        processor: selectedProcessor
      });
      
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const clearPreview = () => {
    setDataPreview(null);
    setUploadResult(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Enhanced File Upload</h2>
        <p className="text-muted-foreground">
          Upload CSV or Excel files with transaction data. The system will automatically detect field names and parse the data.
        </p>
      </div>

      {/* Processor Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Processor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {processors.map((processor) => (
              <Button
                key={processor.value}
                variant={selectedProcessor === processor.value ? "default" : "outline"}
                onClick={() => setSelectedProcessor(processor.value)}
                className="w-full"
              >
                {processor.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload File
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-primary">Drop the file here...</p>
            ) : (
              <div>
                <p className="text-foreground mb-2">Drag and drop a file here, or click to select</p>
                <p className="text-sm text-muted-foreground">Supports CSV, Excel (.xlsx, .xls) files</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Preview */}
      {dataPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Data Preview
              <Badge variant="outline" className="ml-2">
                {dataPreview.parsedData.length} rows detected
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearPreview}
                className="ml-auto"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <strong>DBA/Location Field:</strong>
                  <p className="text-muted-foreground">{detectDBAField(dataPreview.headers) || 'Not detected'}</p>
                </div>
                <div>
                  <strong>Volume Field:</strong>
                  <p className="text-muted-foreground">{detectVolumeField(dataPreview.headers) || 'Not detected'}</p>
                </div>
                <div>
                  <strong>Agent Payout Field:</strong>
                  <p className="text-muted-foreground">{detectAgentPayoutField(dataPreview.headers) || 'Not detected'}</p>
                </div>
                <div>
                  <strong>Date Field:</strong>
                  <p className="text-muted-foreground">{detectDateField(dataPreview.headers) || 'Not detected'}</p>
                </div>
              </div>
              
              {dataPreview.parsedData.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Parsed Data Sample (First 5 rows):</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>DBA/Location</TableHead>
                        <TableHead>Volume</TableHead>
                        <TableHead>Agent Payout</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataPreview.parsedData.slice(0, 5).map((row, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{row.dbaName}</TableCell>
                          <TableCell>${row.volume.toLocaleString()}</TableCell>
                          <TableCell>${row.agentPayout.toLocaleString()}</TableCell>
                          <TableCell>{row.transactionDate}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleUpload} 
                  disabled={isUploading || dataPreview.parsedData.length === 0}
                  className="flex-1"
                >
                  {isUploading ? 'Uploading...' : `Upload ${dataPreview.parsedData.length} Records`}
                </Button>
                <Button variant="outline" onClick={clearPreview}>
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {uploadResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              Upload {uploadResult.success ? 'Completed' : 'Failed'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {uploadResult.success ? (
              <div className="space-y-2">
                <p className="text-sm">
                  Successfully processed <strong>{uploadResult.processedRows}</strong> out of{' '}
                  <strong>{uploadResult.totalRows}</strong> rows for processor{' '}
                  <Badge variant="outline">{uploadResult.processor}</Badge>
                </p>
                {uploadResult.errors && uploadResult.errors.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <details>
                        <summary className="cursor-pointer">
                          {uploadResult.errors.length} errors occurred during processing
                        </summary>
                        <ul className="mt-2 list-disc list-inside text-sm">
                          {uploadResult.errors.map((error: string, index: number) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </details>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{uploadResult.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FileUpload;
