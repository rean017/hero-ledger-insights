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

const FileUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadSuccess(false);
      setUploadError(null);
      setProgress({
        total: 0,
        processed: 0,
        errors: []
      });
    }
  };

  const ensureLocationExists = async (locationName: string, accountId?: string): Promise<string> => {
    try {
      console.log('🔍 LOCATION MERGER: Checking for existing location with name:', locationName);
      
      // First, check for exact name match (case-insensitive) - FIXED: Include name in select
      const { data: existingLocations, error: selectError } = await supabase
        .from('locations')
        .select('id, name, account_id')
        .ilike('name', locationName);

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('Error checking existing locations:', selectError);
        throw selectError;
      }

      // Check if we found an exact match
      if (existingLocations && existingLocations.length > 0) {
        const exactMatch = existingLocations.find(loc => 
          loc.name?.toLowerCase() === locationName.toLowerCase()
        );

        if (exactMatch) {
          console.log('✅ LOCATION MERGER: Found exact match:', exactMatch.name);
          return exactMatch.id;
        }
      }

      // If no exact match found, create new location
      console.log('🆕 LOCATION MERGER: Creating new location:', locationName);
      const { data: newLocation, error: insertError } = await supabase
        .from('locations')
        .insert([{ 
          name: locationName,
          account_id: accountId 
        }])
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating location:', insertError);
        throw insertError;
      }

      console.log('✅ LOCATION MERGER: Created new location with ID:', newLocation.id);
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
    return rawData.map(row => {
      // Try to extract date from various possible fields
      const dateValue = row['Transaction Date'] || row['Date'] || row['TRANSACTION_DATE'] || null;
      
      // Try to extract location name from various possible fields
      const locationName = row['Location'] || row['LOCATION'] || row['Merchant'] || row['MERCHANT'] || 'Unknown Location';
      
      // Try to extract account ID from various possible fields
      const accountId = row['Account ID'] || row['ACCOUNT_ID'] || row['Account'] || row['ACCOUNT'] || null;
      
      // Try to extract volume from various possible fields (bank card volume)
      const volume = parseFloat(row['Volume'] || row['VOLUME'] || row['Bank Card Volume'] || row['BANK_CARD_VOLUME'] || 0);
      
      // Try to extract debit volume from various possible fields
      const debitVolume = parseFloat(row['Debit Volume'] || row['DEBIT_VOLUME'] || 0);
      
      // Try to extract agent payout from various possible fields
      const agentPayout = parseFloat(row['Agent Payout'] || row['AGENT_PAYOUT'] || row['Net Revenue'] || row['NET_REVENUE'] || 0);
      
      // Use the selected upload month instead of trying to parse dates from the file
      let transactionDate = null;
      let month = uploadMonth;

      // If no upload month is selected, fall back to parsing the date from the file
      if (!uploadMonth && dateValue) {
        try {
          // Handle Excel date serial numbers
          if (typeof dateValue === 'number') {
            const excelEpoch = new Date(1899, 11, 30);
            const date = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
            transactionDate = date.toISOString().split('T')[0];
            month = getMonthString(date);
          } 
          // Handle string dates
          else if (typeof dateValue === 'string') {
            // Try to parse the date string
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
              transactionDate = date.toISOString().split('T')[0];
              month = getMonthString(date);
            }
          }
        } catch (error) {
          console.error('Error parsing date:', dateValue, error);
        }
      } else if (uploadMonth) {
        // Use the upload month to create a transaction date (first day of the month)
        transactionDate = `${uploadMonth}-01`;
      }
      
      return {
        location_name: locationName,
        account_id: accountId,
        volume: isNaN(volume) ? 0 : volume,
        debit_volume: isNaN(debitVolume) ? 0 : debitVolume,
        agent_payout: isNaN(agentPayout) ? 0 : agentPayout,
        transaction_date: transactionDate,
        month
      };
    }).filter(row => row.month !== null); // Filter out rows without a valid month
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
      const uploadMonth = selectedMonth; // Already in YYYY-MM format
      console.log('📅 Upload Month Selected:', uploadMonth);

      // Record the upload in file_uploads table
      const { data: uploadRecord, error: uploadRecordError } = await supabase
        .from('file_uploads')
        .insert([{
          filename: file.name,
          processor: `Upload-${uploadMonth}`,
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
      
      // Normalize the data to a consistent format with the selected month
      const normalizedData = normalizeTransactionData(rawData as any[], uploadMonth);
      
      setProgress({
        total: normalizedData.length,
        processed: 0,
        errors: []
      });
      
      // Process in batches to avoid overwhelming the database
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < normalizedData.length; i += batchSize) {
        batches.push(normalizedData.slice(i, i + batchSize));
      }
      
      console.log(`Processing ${normalizedData.length} transactions in ${batches.length} batches for month ${uploadMonth}`);
      
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
            // Update progress
            setProgress(prev => ({
              ...prev,
              processed: processedCount,
              currentRow: processedCount + 1
            }));
            
            // Ensure location exists and get its ID
            if (transaction.location_name && transaction.location_name !== 'Unknown Location') {
              const locationId = await ensureLocationExists(transaction.location_name, transaction.account_id);
              batchWithLocations.push({
                ...transaction,
                location_id: locationId,
                processor: `Upload-${uploadMonth}` // Tag with the selected month
              });
            } else {
              batchWithLocations.push({
                ...transaction,
                processor: `Upload-${uploadMonth}` // Tag with the selected month
              });
            }
            
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
        
        // Update progress
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
        <h2 className="text-2xl font-bold text-foreground mb-2">Upload Transactions</h2>
        <p className="text-muted-foreground">Upload transaction data from Excel or CSV files</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Transaction Upload
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
                <h4 className="font-medium text-blue-800">Upload Instructions</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Select a month first, then upload Excel (.xlsx, .xls) or CSV files containing transaction data. 
                  All transactions will be tagged with the selected month. The system will automatically map columns 
                  like Transaction Date, Location, Account ID, Volume, and Agent Payout.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                    Month Selection Required
                  </Badge>
                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                    Transaction Date
                  </Badge>
                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                    Location/Merchant
                  </Badge>
                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                    Account ID
                  </Badge>
                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                    Volume
                  </Badge>
                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                    Debit Volume
                  </Badge>
                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                    Agent Payout/Net Revenue
                  </Badge>
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
