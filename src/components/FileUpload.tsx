import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, AlertCircle, CheckCircle, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

interface ProcessedData {
  volume?: number;
  debitVolume?: number;
  agentPayout?: number;
  agentName?: string;
  accountId?: string;
  locationName?: string;
  transactionDate?: string;
  rawData: any;
  processor?: string;
}

const FileUpload = () => {
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    status: 'idle' | 'processing' | 'success' | 'error';
    message: string;
    filename?: string;
    rowsProcessed?: number;
  }>({ status: 'idle', message: '' });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Generate months for the last 2 years and next year
  const generateMonthOptions = () => {
    const months = [];
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
    // Add months from 2 years ago to next year
    for (let year = currentYear - 2; year <= currentYear + 1; year++) {
      for (let month = 0; month < 12; month++) {
        const date = new Date(year, month, 1);
        const value = `${year}-${String(month + 1).padStart(2, '0')}`;
        const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        months.push({ value, label });
      }
    }
    
    return months.reverse(); // Most recent first
  };

  const monthOptions = generateMonthOptions();

  const detectProcessor = (headers: string[], firstDataRow?: any): string => {
    const headerStr = headers.join('|').toLowerCase();
    
    console.log('Detecting processor from headers:', headers);
    console.log('First data row sample:', firstDataRow);
    
    // Check for TRNXN specific columns
    if (headerStr.includes('bank card volume') || headerStr.includes('bankcard volume') || headerStr.includes('salescode')) {
      console.log('Detected TRNXN processor');
      return 'TRNXN';
    }
    
    // Check for Maverick specific columns
    if (headerStr.includes('total amount') && headerStr.includes('sales rep')) {
      console.log('Detected Maverick processor');
      return 'Maverick';
    }
    
    // Check for SignaPay specific columns
    if (headerStr.includes('gross sales') && headerStr.includes('residual')) {
      console.log('Detected SignaPay processor');
      return 'SignaPay';
    }
    
    // Check for Green Payments specific columns
    if (headerStr.includes('processing volume') && headerStr.includes('agent revenue')) {
      console.log('Detected Green Payments processor');
      return 'Green Payments';
    }

    // Additional check for Green Payments based on file name patterns or content
    if (headerStr.includes('fiserv') || headerStr.includes('residuals')) {
      console.log('Detected Green Payments processor (Fiserv format)');
      return 'Green Payments';
    }
    
    // Default fallback
    console.log('Could not detect processor, using Unknown');
    return 'Unknown';
  };

  const processRow = (row: any, processor: string): ProcessedData | null => {
    try {
      let processed: ProcessedData = { rawData: row, processor };

      console.log('Processing row for processor:', processor);
      console.log('Row data keys:', Object.keys(row));
      console.log('Row data sample:', row);

      // Handle the specific Green Payments CSV format with __parsed_extra
      if (row.__parsed_extra && Array.isArray(row.__parsed_extra)) {
        // This appears to be a Green Payments Fiserv format where:
        // Column 0: Merchant ID
        // Column 1: Merchant Name  
        // Column 2: Transactions
        // Column 3: Sales Amount (Volume)
        // Column 4: Net
        // Column 5: BPS
        // Column 6: Agent Net (Payout)
        
        const merchantId = Object.values(row)[0] as string;
        const extraData = row.__parsed_extra;
        
        if (extraData.length >= 6) {
          processed.accountId = merchantId;
          processed.locationName = extraData[0] as string;
          processed.volume = parseFloat(extraData[2] as string) || 0;
          processed.agentPayout = parseFloat(extraData[5] as string) || 0;
          processed.debitVolume = 0; // Not provided in this format
          processed.agentName = null; // Will be assigned manually
        }
      } else {
        // Handle other processor formats
        switch (processor) {
          case 'TRNXN':
            processed.volume = parseFloat(row['Bank Card Volume'] || row['Bankcard Volume'] || 0);
            processed.debitVolume = parseFloat(row['Debit'] || 0);
            processed.agentPayout = parseFloat(row['Net Commission'] || row['Commission'] || 0);
            processed.agentName = row['SalesCode'] || row['Partner'] || row['Sales Code'];
            processed.accountId = row['Account ID'] || row['MID'] || row['Merchant ID'] || row['Account'] || null;
            processed.locationName = row['DBA'] || row['Business Name'] || row['Location'] || null;
            processed.transactionDate = row['Date'] || row['Period'] || row['Transaction Date'] || null;
            break;

          case 'Maverick':
            processed.volume = parseFloat(row['Total Amount'] || row['Volume'] || row['Sales'] || 0);
            processed.debitVolume = parseFloat(row['Debit Amount'] || row['Returns'] || 0);
            processed.agentPayout = parseFloat(row['Commission'] || row['Agent Commission'] || 0);
            processed.agentName = row['Sales Rep'] || row['Agent'] || row['Representative'];
            processed.accountId = row['Merchant ID'] || row['MID'] || row['Account'];
            processed.locationName = row['Business Name'] || row['DBA'] || row['Merchant Name'] || row['Location'];
            processed.transactionDate = row['Settlement Date'] || row['Date'] || row['Trans Date'];
            break;

          case 'SignaPay':
            processed.volume = parseFloat(row['Gross Sales'] || row['Volume'] || row['Amount'] || 0);
            processed.debitVolume = parseFloat(row['Returns'] || row['Chargebacks'] || 0);
            processed.agentPayout = parseFloat(row['Residual'] || row['Agent Pay'] || 0);
            processed.agentName = row['Agent Name'] || row['Rep'] || row['Sales Agent'];
            processed.accountId = row['DBA'] || row['Merchant'] || row['Account Number'];
            processed.locationName = row['DBA'] || row['Business Name'] || row['Merchant Name'] || row['Location'];
            processed.transactionDate = row['Process Date'] || row['Date'] || row['Settlement Date'];
            break;

          case 'Green Payments':
            processed.volume = parseFloat(row['Processing Volume'] || row['Volume'] || row['Sales Volume'] || 0);
            processed.debitVolume = parseFloat(row['Debit Volume'] || row['Refunds'] || 0);
            processed.agentPayout = parseFloat(row['Agent Revenue'] || row['Commission'] || 0);
            processed.agentName = row['Agent'] || row['Partner'] || row['Sales Partner'];
            processed.accountId = row['Merchant ID'] || row['Account'] || row['Customer ID'];
            processed.locationName = row['Business Name'] || row['DBA'] || row['Merchant Name'] || row['Location'];
            processed.transactionDate = row['Date'] || row['Processing Date'] || row['Trans Date'];
            break;

          default:
            // Generic mapping - try common column names
            processed.volume = parseFloat(row['Volume'] || row['Bankcard Volume'] || row['Income'] || row['Sales'] || row['Amount'] || 0);
            processed.debitVolume = parseFloat(row['Debit Volume'] || row['Returns'] || 0);
            processed.agentPayout = parseFloat(row['Commission'] || row['Agent Payout'] || row['Payout'] || row['Net Commission'] || row['Gross Commission'] || 0);
            processed.agentName = row['Agent'] || row['Sales Code'] || row['Partner'] || row['Rep'];
            processed.accountId = row['MID'] || row['Account ID'] || row['Merchant ID'];
            processed.locationName = row['DBA'] || row['Business Name'] || row['Location'] || row['Merchant Name'];
            processed.transactionDate = row['Date'] || row['Period'] || row['Transaction Date'];
            break;
        }
      }

      console.log('Processed data result:', {
        volume: processed.volume,
        debitVolume: processed.debitVolume,
        agentPayout: processed.agentPayout,
        agentName: processed.agentName,
        accountId: processed.accountId,
        locationName: processed.locationName
      });

      return processed;
    } catch (error) {
      console.error('Error processing row:', error);
      return null;
    }
  };

  const ensureAgentExists = async (agentName: string): Promise<string | null> => {
    if (!agentName) return null;

    try {
      // Check if agent already exists
      const { data: existingAgent, error: selectError } = await supabase
        .from('agents')
        .select('id')
        .eq('name', agentName)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('Error checking existing agent:', selectError);
        return null;
      }

      if (existingAgent) {
        return existingAgent.id;
      }

      // Create new agent
      const { data: newAgent, error: insertError } = await supabase
        .from('agents')
        .insert({
          name: agentName,
          is_active: true
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating agent:', insertError);
        return null;
      }

      console.log('Created new agent:', newAgent);
      return newAgent.id;
    } catch (error) {
      console.error('Error in ensureAgentExists:', error);
      return null;
    }
  };

  const ensureLocationExists = async (locationName: string, accountId?: string): Promise<string | null> => {
    if (!locationName) return null;

    try {
      // Check if location already exists
      const { data: existingLocation, error: selectError } = await supabase
        .from('locations')
        .select('id')
        .eq('name', locationName)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('Error checking existing location:', selectError);
        return null;
      }

      if (existingLocation) {
        return existingLocation.id;
      }

      // Create new location
      const { data: newLocation, error: insertError } = await supabase
        .from('locations')
        .insert({
          name: locationName,
          account_id: accountId || null,
          account_type: 'Business'
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating location:', insertError);
        return null;
      }

      console.log('Created new location:', newLocation);
      return newLocation.id;
    } catch (error) {
      console.error('Error in ensureLocationExists:', error);
      return null;
    }
  };

  const parseFile = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();

      if (fileExtension === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            resolve(results.data);
          },
          error: (error) => {
            reject(error);
          }
        });
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            resolve(jsonData);
          } catch (error) {
            reject(error);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        reject(new Error('Unsupported file format'));
      }
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedMonth) {
      toast({
        title: "Error",
        description: "Please select a month and a file",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    setUploadStatus({ status: 'processing', message: 'Processing file...', filename: file.name });

    try {
      console.log('=== Starting File Upload Process ===');
      console.log('Selected month:', selectedMonth);
      console.log('File name:', file.name);
      
      // Parse the file
      const rawData = await parseFile(file);
      console.log('Parsed data length:', rawData.length);
      console.log('Parsed data sample (first 3 rows):', rawData.slice(0, 3));

      if (rawData.length === 0) {
        throw new Error('No data found in file');
      }

      // Detect processor based on column headers and first data row
      const headers = Object.keys(rawData[0]);
      const detectedProcessor = detectProcessor(headers, rawData[1]);
      
      console.log('Detected processor:', detectedProcessor);
      console.log('File headers:', headers);

      // Fix the date range issue - use proper last day of month
      const [year, month] = selectedMonth.split('-');
      const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endDate = `${selectedMonth}-${lastDayOfMonth}`;

      console.log('Deleting existing transactions for processor:', detectedProcessor, 'and month:', selectedMonth);
      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('processor', detectedProcessor)
        .gte('transaction_date', `${selectedMonth}-01`)
        .lte('transaction_date', endDate);

      if (deleteError) {
        console.error('Error deleting existing transactions:', deleteError);
      } else {
        console.log('Successfully deleted existing transactions');
      }

      // Create file upload record
      const { data: uploadRecord, error: uploadError } = await supabase
        .from('file_uploads')
        .insert({
          filename: file.name,
          processor: detectedProcessor,
          status: 'processing'
        })
        .select()
        .single();

      if (uploadError) throw uploadError;
      console.log('Created upload record:', uploadRecord);

      let successCount = 0;
      let errorCount = 0;
      let locationsCreated = 0;
      const errors: any[] = [];

      // Process each row
      console.log('=== Processing Rows ===');
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        console.log(`\n--- Processing row ${i + 1} ---`);
        const processedData = processRow(row, detectedProcessor);

        if (processedData) {
          console.log('Processed data for row', i + 1, ':', {
            volume: processedData.volume,
            debitVolume: processedData.debitVolume,
            agentPayout: processedData.agentPayout,
            agentName: processedData.agentName,
            accountId: processedData.accountId
          });

          // Check if we have meaningful data (volume OR agent payout)
          if ((processedData.volume && processedData.volume > 0) || (processedData.agentPayout && processedData.agentPayout > 0)) {
            try {
              // Ensure location exists if we have location data
              let locationId = null;
              if (processedData.locationName) {
                const existingLocationId = await ensureLocationExists(processedData.locationName, processedData.accountId);
                if (existingLocationId) {
                  locationId = existingLocationId;
                  // Check if this was a newly created location
                  const { data: locationCheck } = await supabase
                    .from('locations')
                    .select('created_at')
                    .eq('id', existingLocationId)
                    .single();
                  
                  if (locationCheck && new Date(locationCheck.created_at).getTime() > Date.now() - 5000) {
                    locationsCreated++;
                  }
                }
              }

              // Use the selected month instead of the transaction date from file
              const transactionDate = `${selectedMonth}-01`;

              const transactionData = {
                processor: detectedProcessor,
                volume: processedData.volume || 0,
                debit_volume: processedData.debitVolume || 0,
                agent_payout: processedData.agentPayout || 0,
                agent_name: null, // Don't store agent names from uploads
                account_id: processedData.accountId,
                transaction_date: transactionDate,
                raw_data: processedData.rawData
              };

              console.log('Inserting transaction data:', transactionData);

              const { error } = await supabase
                .from('transactions')
                .insert(transactionData);

              if (error) {
                console.error('Database insertion error for row', i + 1, ':', error);
                errorCount++;
                errors.push({ row: i + 1, error: error.message });
              } else {
                successCount++;
                console.log(`Successfully inserted row ${i + 1}`);
              }
            } catch (error) {
              console.error('Error processing row', i + 1, ':', error);
              errorCount++;
              errors.push({ row: i + 1, error: String(error) });
            }
          } else {
            console.log(`Skipping row ${i + 1} - no valid volume or payout data (volume: ${processedData.volume}, payout: ${processedData.agentPayout})`);
            errorCount++;
            errors.push({ row: i + 1, error: 'No valid volume or payout data found' });
          }
        } else {
          console.log(`Skipping row ${i + 1} - failed to process`);
          errorCount++;
          errors.push({ row: i + 1, error: 'Failed to process row' });
        }
      }

      console.log('=== Upload Summary ===');
      console.log('Success count:', successCount);
      console.log('Error count:', errorCount);
      console.log('Total rows processed:', rawData.length);

      // Update file upload record
      await supabase
        .from('file_uploads')
        .update({
          status: errorCount === rawData.length ? 'failed' : 'completed',
          rows_processed: successCount,
          errors: errors.length > 0 ? errors : null
        })
        .eq('id', uploadRecord.id);

      // Invalidate all relevant queries to refresh dashboard and other components
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['top-agents'] });
      queryClient.invalidateQueries({ queryKey: ['agents-data'] });
      queryClient.invalidateQueries({ queryKey: ['file-uploads'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-pl-data'] });
      queryClient.invalidateQueries({ queryKey: ['current-month-summary'] });
      queryClient.invalidateQueries({ queryKey: ['agent-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['location_agent_assignments'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });

      const successMessage = `Processed ${successCount} rows successfully from ${detectedProcessor} for ${monthOptions.find(m => m.value === selectedMonth)?.label}. ${errorCount} errors.${locationsCreated > 0 ? ` Created ${locationsCreated} new locations.` : ''}`;

      setUploadStatus({
        status: errorCount === rawData.length ? 'error' : 'success',
        message: successMessage,
        filename: file.name,
        rowsProcessed: successCount
      });

      toast({
        title: "Upload Complete",
        description: successMessage,
      });

    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus({
        status: 'error',
        message: `Error processing file: ${String(error)}`,
        filename: file.name
      });

      toast({
        title: "Upload Failed",
        description: String(error),
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      // Reset file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Transaction Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Month</label>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger>
              <SelectValue placeholder="Choose month..." />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {month.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedMonth && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Upload File (CSV or XLSX)</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <FileText className="w-8 h-8 mb-4 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">CSV or XLSX files only</p>
                  <p className="text-xs text-primary mt-1">
                    Data will be uploaded for: {monthOptions.find(m => m.value === selectedMonth)?.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Processor will be automatically detected
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={uploading || !selectedMonth}
                />
              </label>
            </div>
          </div>
        )}

        {uploadStatus.status !== 'idle' && (
          <div className={`p-4 rounded-lg flex items-center gap-3 ${
            uploadStatus.status === 'success' ? 'bg-emerald-50 border-emerald-200' :
            uploadStatus.status === 'error' ? 'bg-red-50 border-red-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            {uploadStatus.status === 'processing' && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            )}
            {uploadStatus.status === 'success' && (
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            )}
            {uploadStatus.status === 'error' && (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <div>
              <p className="text-sm font-medium">{uploadStatus.message}</p>
              {uploadStatus.filename && (
                <p className="text-xs text-muted-foreground">File: {uploadStatus.filename}</p>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-1">System automatically detects processor and applies correct mapping:</p>
          <ul className="space-y-1">
            <li><strong>TRNXN:</strong> Bank Card Volume (for Volume), Debit (for Debit Volume), Net Commission/Commission (for Agent Payout), SalesCode/Partner (for Agent Name)</li>
            <li><strong>Maverick:</strong> Total Amount, Debit Amount, Commission, Sales Rep, Merchant ID, Business Name/DBA, Settlement Date</li>
            <li><strong>SignaPay:</strong> Gross Sales, Returns, Residual, Agent Name, DBA, Business Name, Process Date</li>
            <li><strong>Green Payments:</strong> Processing Volume, Debit Volume, Agent Revenue, Agent, Merchant ID, Business Name, Date</li>
          </ul>
          <p className="mt-2 text-xs"><strong>Note:</strong> Agent data is NOT imported from files. Create agents manually and assign them to locations. Uploading data replaces existing data for that month and processor.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUpload;
