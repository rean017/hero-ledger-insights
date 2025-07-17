
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, File, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { getMonthString } from "@/utils/timeFrameUtils";

interface ProcessingProgress {
  total: number;
  processed: number;
  errors: string[];
  currentRow?: number;
}

interface ParsedPreview {
  dbaName: string;
  volume: number;
  agentPayout: number;
  originalRow: any;
}

const FileUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dataPreview, setDataPreview] = useState<ParsedPreview[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress>({
    total: 0,
    processed: 0,
    errors: []
  });
  const { toast } = useToast();

  // Generate month options for the current year and next year
  const generateMonthOptions = () => {
    const currentYear = new Date().getFullYear();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const options = [];
    
    // Add months for current year and next year
    for (let year = currentYear; year <= currentYear + 1; year++) {
      months.forEach((month, index) => {
        const monthNumber = (index + 1).toString().padStart(2, '0');
        const value = `${year}-${monthNumber}`;
        const label = `${month} ${year}`;
        options.push({ value, label });
      });
    }
    
    return options;
  };

  const monthOptions = generateMonthOptions();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadSuccess(false);
      setUploadError(null);
      setShowPreview(false);
      setProgress({
        total: 0,
        processed: 0,
        errors: []
      });

      // Parse file and show preview
      try {
        let rawData;
        if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
          rawData = await processExcelFile(selectedFile);
        } else if (selectedFile.name.endsWith('.csv')) {
          rawData = await processCSVFile(selectedFile);
        } else {
          throw new Error('Unsupported file format');
        }

        const preview = analyzeAndPreviewData(rawData as any[]);
        setDataPreview(preview);
        setShowPreview(true);
      } catch (error) {
        console.error('Error previewing file:', error);
        toast({
          title: "Preview Failed",
          description: "Could not preview file data. You can still try to upload.",
          variant: "destructive"
        });
      }
    }
  };

  const analyzeAndPreviewData = (rawData: any[]): ParsedPreview[] => {
    console.log('🔍 ENHANCED PARSER: Starting analysis of raw data');
    console.log('📊 Raw data sample:', rawData.slice(0, 3));
    
    if (!rawData || rawData.length === 0) return [];

    const firstRow = rawData[0];
    const columns = Object.keys(firstRow);
    console.log('📋 Available columns:', columns);

    // Enhanced field matching with more comprehensive patterns
    const fieldMappings = {
      dba: [
        'DBA', 'DBA Name', 'Business Name', 'Business', 'Merchant Name', 'Merchant',
        'Location', 'Store Name', 'Store', 'Company Name', 'Company', 'Name',
        'Account Name', 'Client Name', 'Client'
      ],
      volume: [
        'Bankcard Volume', 'Bank Card Volume', 'Credit Card Volume', 'Volume', 'Sales Volume',
        'Total Volume', 'Sales Amount', 'Sales', 'Revenue', 'Amount', 'Card Sales',
        'Transaction Amount', 'Gross Sales', 'Processing Volume', 'CC Volume'
      ],
      agentPayout: [
        'Commission', 'Net Commission', 'Gross Commission', 'Agent Commission',
        'Agent Net Revenue', 'Net Revenue', 'Agent Payout', 'Payout', 'Residual',
        'Agent Residual', 'Monthly Residual', 'Revenue', 'Profit', 'Net Income',
        'Agent Income', 'Commission Earned'
      ]
    };

    const findBestMatch = (fieldType: keyof typeof fieldMappings) => {
      const patterns = fieldMappings[fieldType];
      console.log(`🔍 Looking for ${fieldType} field in:`, patterns);
      
      for (const pattern of patterns) {
        const exactMatch = columns.find(col => col === pattern);
        if (exactMatch) {
          console.log(`✅ Found exact match for ${fieldType}: ${exactMatch}`);
          return exactMatch;
        }
      }
      
      // Try case-insensitive partial matches
      for (const pattern of patterns) {
        const partialMatch = columns.find(col => 
          col.toLowerCase().includes(pattern.toLowerCase()) || 
          pattern.toLowerCase().includes(col.toLowerCase())
        );
        if (partialMatch) {
          console.log(`✅ Found partial match for ${fieldType}: ${partialMatch}`);
          return partialMatch;
        }
      }
      
      console.log(`❌ No match found for ${fieldType}`);
      return null;
    };

    const dbaField = findBestMatch('dba');
    const volumeField = findBestMatch('volume');
    const agentPayoutField = findBestMatch('agentPayout');

    console.log('📊 FIELD MAPPING RESULTS:');
    console.log(`- DBA Field: ${dbaField}`);
    console.log(`- Volume Field: ${volumeField}`);
    console.log(`- Agent Payout Field: ${agentPayoutField}`);

    const preview = rawData.slice(0, 10).map((row, index) => {
      const dbaValue = dbaField ? row[dbaField] : null;
      const volumeValue = volumeField ? parseFloat(String(row[volumeField]).replace(/[$,]/g, '')) || 0 : 0;
      const agentPayoutValue = agentPayoutField ? parseFloat(String(row[agentPayoutField]).replace(/[$,]/g, '')) || 0 : 0;

      console.log(`📊 Row ${index + 1} parsed:`, {
        dba: dbaValue,
        volume: volumeValue,
        agentPayout: agentPayoutValue,
        originalFields: {
          [dbaField || 'N/A']: dbaField ? row[dbaField] : 'N/A',
          [volumeField || 'N/A']: volumeField ? row[volumeField] : 'N/A',
          [agentPayoutField || 'N/A']: agentPayoutField ? row[agentPayoutField] : 'N/A'
        }
      });

      return {
        dbaName: dbaValue || 'UNKNOWN',
        volume: volumeValue,
        agentPayout: agentPayoutValue,
        originalRow: row
      };
    });

    console.log('📊 PREVIEW GENERATED:', preview);
    return preview;
  };

  const ensureLocationExists = async (dbaName: string): Promise<string> => {
    try {
      console.log('🔍 LOCATION: Checking for existing location with DBA name:', dbaName);
      
      // Check for exact name match (case-insensitive)
      const { data: existingLocations, error: selectError } = await supabase
        .from('locations')
        .select('id, name')
        .ilike('name', dbaName);

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('Error checking existing locations:', selectError);
        throw selectError;
      }

      // Check if we found an exact match
      if (existingLocations && existingLocations.length > 0) {
        const exactMatch = existingLocations.find(loc => 
          loc.name?.toLowerCase() === dbaName.toLowerCase()
        );

        if (exactMatch) {
          console.log('✅ LOCATION: Found exact match:', exactMatch.name);
          return exactMatch.id;
        }
      }

      // If no exact match found, create new location
      console.log('🆕 LOCATION: Creating new location:', dbaName);
      const { data: newLocation, error: insertError } = await supabase
        .from('locations')
        .insert([{ 
          name: dbaName,
          account_id: dbaName // Use DBA name as account_id for matching
        }])
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating location:', insertError);
        throw insertError;
      }

      console.log('✅ LOCATION: Created new location with ID:', newLocation.id);
      return newLocation.id;
    } catch (error) {
      console.error('Error in ensureLocationExists:', error);
      throw error;
    }
  };

  const processExcelFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      return jsonData;
    } catch (error) {
      console.error('Error processing Excel file:', error);
      throw new Error('Failed to process Excel file. Please check the file format.');
    }
  };

  const processCSVFile = async (file: File) => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          resolve(results.data);
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          reject(new Error('Failed to parse CSV file. Please check the file format.'));
        }
      });
    });
  };

  const normalizeTransactionData = (rawData: any[], uploadMonth?: string) => {
    console.log('🎯 ENHANCED PARSER: Starting enhanced data normalization...');
    console.log('📊 Raw data sample:', rawData.slice(0, 3));
    
    const firstRow = rawData[0];
    const columns = Object.keys(firstRow);
    
    // Enhanced field matching
    const fieldMappings = {
      dba: [
        'DBA', 'DBA Name', 'Business Name', 'Business', 'Merchant Name', 'Merchant',
        'Location', 'Store Name', 'Store', 'Company Name', 'Company', 'Name',
        'Account Name', 'Client Name', 'Client'
      ],
      volume: [
        'Bankcard Volume', 'Bank Card Volume', 'Credit Card Volume', 'Volume', 'Sales Volume',
        'Total Volume', 'Sales Amount', 'Sales', 'Revenue', 'Amount', 'Card Sales',
        'Transaction Amount', 'Gross Sales', 'Processing Volume', 'CC Volume'
      ],
      agentPayout: [
        'Commission', 'Net Commission', 'Gross Commission', 'Agent Commission',
        'Agent Net Revenue', 'Net Revenue', 'Agent Payout', 'Payout', 'Residual',
        'Agent Residual', 'Monthly Residual', 'Revenue', 'Profit', 'Net Income',
        'Agent Income', 'Commission Earned'
      ]
    };

    const findBestMatch = (fieldType: keyof typeof fieldMappings) => {
      const patterns = fieldMappings[fieldType];
      
      // Try exact matches first
      for (const pattern of patterns) {
        const exactMatch = columns.find(col => col === pattern);
        if (exactMatch) return exactMatch;
      }
      
      // Try case-insensitive partial matches
      for (const pattern of patterns) {
        const partialMatch = columns.find(col => 
          col.toLowerCase().includes(pattern.toLowerCase()) || 
          pattern.toLowerCase().includes(col.toLowerCase())
        );
        if (partialMatch) return partialMatch;
      }
      
      return null;
    };

    const dbaField = findBestMatch('dba');
    const volumeField = findBestMatch('volume');
    const agentPayoutField = findBestMatch('agentPayout');

    console.log('📊 ENHANCED FIELD MAPPING:');
    console.log(`- DBA Field: ${dbaField}`);
    console.log(`- Volume Field: ${volumeField}`);
    console.log(`- Agent Payout Field: ${agentPayoutField}`);

    const normalized = rawData.map((row, index) => {
      const dbaName = dbaField ? row[dbaField] : null;
      const volumeValue = volumeField ? parseFloat(String(row[volumeField]).replace(/[$,]/g, '')) || 0 : 0;
      const agentPayoutValue = agentPayoutField ? parseFloat(String(row[agentPayoutField]).replace(/[$,]/g, '')) || 0 : 0;

      // Use the upload month to create a transaction date
      let transactionDate = null;
      if (uploadMonth) {
        transactionDate = `${uploadMonth}-01`;
      }
      
      const normalizedRow = {
        dba_name: dbaName,
        account_id: dbaName,
        volume: volumeValue,
        debit_volume: 0,
        agent_payout: agentPayoutValue,
        transaction_date: transactionDate,
        raw_data: { 
          original_row: row,
          parsed_fields: {
            dba_field: dbaField,
            volume_field: volumeField,
            agent_payout_field: agentPayoutField
          }
        }
      };
      
      console.log(`🎯 Row ${index + 1} normalized:`, normalizedRow);
      
      return normalizedRow;
    }).filter(row => {
      const isValid = row.dba_name !== null && 
                     row.transaction_date !== null && 
                     (row.volume > 0 || Math.abs(row.agent_payout) > 0);
      
      if (!isValid) {
        console.log('⚠️ Filtered out invalid row:', row);
      }
      
      return isValid;
    });
    
    console.log(`🎉 ENHANCED PARSER: Normalized ${normalized.length} valid transactions from ${rawData.length} raw rows`);
    
    return normalized;
  };

  const uploadTransactions = async () => {
    if (!file) return;
    
    if (!selectedMonth) {
      toast({
        title: "Month Required",
        description: "Please select a month for this upload before proceeding.",
        variant: "destructive"
      });
      return;
    }
    
    setIsUploading(true);
    setUploadSuccess(false);
    setUploadError(null);
    
    try {
      const uploadMonth = selectedMonth;
      console.log('📅 Upload Month Selected:', uploadMonth);

      // Record the upload in file_uploads table
      const { data: uploadRecord, error: uploadRecordError } = await supabase
        .from('file_uploads')
        .insert([{
          filename: file.name,
          processor: 'Enhanced-Maverick',
          status: 'processing'
        }])
        .select('id')
        .single();

      if (uploadRecordError) {
        throw uploadRecordError;
      }

      let rawData;
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        rawData = await processExcelFile(file);
      } else if (file.name.endsWith('.csv')) {
        rawData = await processCSVFile(file);
      } else {
        throw new Error('Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV file.');
      }
      
      // Normalize the data with enhanced parsing
      const normalizedData = normalizeTransactionData(rawData as any[], uploadMonth);
      
      setProgress({
        total: normalizedData.length,
        processed: 0,
        errors: []
      });
      
      // Process in batches
      const batchSize = 50;
      const batches = [];
      
      for (let i = 0; i < normalizedData.length; i += batchSize) {
        batches.push(normalizedData.slice(i, i + batchSize));
      }
      
      console.log(`🎯 ENHANCED UPLOAD: Processing ${normalizedData.length} transactions in ${batches.length} batches for ${uploadMonth}`);
      
      let processedCount = 0;
      const errors = [];
      
      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchWithLocations = [];
        
        // For each transaction in the batch, ensure the location exists
        for (let j = 0; j < batch.length; j++) {
          const transaction = batch[j];
          
          try {
            setProgress(prev => ({
              ...prev,
              processed: processedCount,
              currentRow: processedCount + 1
            }));
            
            // Ensure location exists using DBA name
            const locationId = await ensureLocationExists(transaction.dba_name);
            
            // Remove dba_name from transaction data and add location_id
            const { dba_name, ...transactionWithoutDbaName } = transaction;
            batchWithLocations.push({
              ...transactionWithoutDbaName,
              location_id: locationId,
              processor: 'Enhanced-Maverick'
            });
            
            processedCount++;
          } catch (error: any) {
            console.error('Error processing transaction:', error);
            errors.push(`Row ${processedCount + 1}: ${error.message || 'Unknown error'}`);
            processedCount++;
          }
        }
        
        // Insert the batch into the database
        if (batchWithLocations.length > 0) {
          const { error } = await supabase
            .from('transactions')
            .insert(batchWithLocations);
          
          if (error) {
            console.error('Error inserting batch:', error);
            errors.push(`Batch ${i + 1}: ${error.message}`);
          }
        }
        
        setProgress(prev => ({
          ...prev,
          processed: processedCount,
          errors
        }));
      }

      // Update the upload record as completed
      await supabase
        .from('file_uploads')
        .update({
          status: errors.length > 0 ? 'failed' : 'completed',
          rows_processed: processedCount,
          errors: errors.length > 0 ? errors : null
        })
        .eq('id', uploadRecord.id);
      
      const selectedMonthObj = monthOptions.find(opt => opt.value === selectedMonth);
      const monthLabel = selectedMonthObj?.label || selectedMonth;
      
      if (errors.length > 0) {
        setUploadError(`Uploaded with ${errors.length} errors. Check console for details.`);
      } else {
        setUploadSuccess(true);
        toast({
          title: "Upload Successful",
          description: `Successfully processed ${processedCount} transactions for ${monthLabel}.`,
        });
      }
    } catch (error: any) {
      console.error('Error uploading file:', error);
      setUploadError(error.message || 'An unknown error occurred');
      toast({
        title: "Upload Failed",
        description: error.message || 'An unknown error occurred',
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setSelectedMonth("");
    setUploadSuccess(false);
    setUploadError(null);
    setShowPreview(false);
    setDataPreview([]);
    setProgress({
      total: 0,
      processed: 0,
      errors: []
    });
  };

  const selectedMonthObj = monthOptions.find(opt => opt.value === selectedMonth);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Enhanced Upload Transactions</h2>
        <p className="text-muted-foreground">Upload transaction data with enhanced field detection and data preview</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Enhanced Transaction Upload with Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Month Selection */}
            <div className="space-y-2">
              <Label>Select Month for Upload</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMonth && (
                <p className="text-sm text-muted-foreground">
                  All transactions in this upload will be tagged for {selectedMonthObj?.label}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="file-upload">Select File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  className="flex-1"
                />
                {file && !uploadSuccess && !isUploading && selectedMonth && (
                  <Button onClick={uploadTransactions}>
                    Upload
                  </Button>
                )}
                {(uploadSuccess || uploadError) && (
                  <Button variant="outline" onClick={resetUpload}>
                    Reset
                  </Button>
                )}
              </div>
              {file && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <File className="h-4 w-4" />
                  {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </div>
              )}
              {file && !selectedMonth && (
                <p className="text-sm text-orange-600">
                  Please select a month before uploading
                </p>
              )}
            </div>

            {/* Data Preview */}
            {showPreview && dataPreview.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium">Data Preview (First 10 rows)</h3>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-3 text-left">DBA Name</th>
                          <th className="p-3 text-left">Volume</th>
                          <th className="p-3 text-left">Agent Payout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataPreview.map((row, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-3">{row.dbaName}</td>
                            <td className="p-3">${row.volume.toLocaleString()}</td>
                            <td className="p-3">${row.agentPayout.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Review the parsed data above. If the values look correct, proceed with the upload.
                </p>
              </div>
            )}
            
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Processing transactions...</span>
                  <span>{progress.processed} / {progress.total}</span>
                </div>
                <Progress value={(progress.processed / progress.total) * 100} />
                {progress.currentRow && (
                  <p className="text-xs text-muted-foreground">
                    Processing row {progress.currentRow}...
                  </p>
                )}
              </div>
            )}
            
            {uploadSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4 flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-green-800">Upload Successful</h4>
                  <p className="text-sm text-green-700 mt-1">
                    Successfully processed {progress.processed} transactions for {selectedMonthObj?.label}.
                  </p>
                </div>
              </div>
            )}
            
            {uploadError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-800">Upload Failed</h4>
                  <p className="text-sm text-red-700 mt-1">{uploadError}</p>
                  {progress.errors.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-sm font-medium text-red-800 cursor-pointer">
                        View {progress.errors.length} errors
                      </summary>
                      <ul className="mt-2 text-xs text-red-700 list-disc list-inside">
                        {progress.errors.slice(0, 10).map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                        {progress.errors.length > 10 && (
                          <li>...and {progress.errors.length - 10} more errors</li>
                        )}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            )}
            
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-800">Enhanced Upload with Field Detection</h4>
                <p className="text-sm text-blue-700 mt-1">
                  This enhanced parser automatically detects DBA names, volume amounts, and agent payouts from various field names. 
                  It will show you a preview of the parsed data before uploading to ensure accuracy.
                </p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <h5 className="font-medium text-blue-800 text-xs">DBA Names</h5>
                    <p className="text-xs text-blue-700">Business Name, DBA, Merchant Name, etc.</p>
                  </div>
                  <div>
                    <h5 className="font-medium text-blue-800 text-xs">Volume Fields</h5>
                    <p className="text-xs text-blue-700">Bankcard Volume, Sales Amount, Revenue, etc.</p>
                  </div>
                  <div>
                    <h5 className="font-medium text-blue-800 text-xs">Payout Fields</h5>
                    <p className="text-xs text-blue-700">Commission, Net Revenue, Agent Payout, etc.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FileUpload;
