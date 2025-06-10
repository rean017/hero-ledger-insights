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
    
    for (let year = currentYear - 2; year <= currentYear + 1; year++) {
      for (let month = 0; month < 12; month++) {
        const date = new Date(year, month, 1);
        const value = `${year}-${String(month + 1).padStart(2, '0')}`;
        const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        months.push({ value, label });
      }
    }
    
    return months.reverse();
  };

  const monthOptions = generateMonthOptions();

  // Smart column detection for location names
  const detectLocationColumn = (headers: string[]): string | null => {
    const locationKeywords = [
      'location', 'merchant', 'business', 'store', 'shop', 'company', 'name',
      'dba', 'account', 'client', 'customer', 'venue', 'establishment', 'outlet'
    ];
    
    console.log('Detecting location column from headers:', headers);
    
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim();
      for (const keyword of locationKeywords) {
        if (headerLower.includes(keyword)) {
          console.log('Found location column:', header);
          return header;
        }
      }
    }
    
    // Fallback: look for the first text column that's not obviously numeric
    for (const header of headers) {
      if (!header.toLowerCase().includes('amount') && 
          !header.toLowerCase().includes('volume') && 
          !header.toLowerCase().includes('total') &&
          !header.toLowerCase().includes('sum') &&
          !header.toLowerCase().includes('commission') &&
          !header.toLowerCase().includes('payout') &&
          !header.toLowerCase().includes('rate') &&
          !header.toLowerCase().includes('percent')) {
        console.log('Using fallback location column:', header);
        return header;
      }
    }
    
    console.log('No location column detected');
    return null;
  };

  // Smart column detection for volume/sales amounts
  const detectVolumeColumn = (headers: string[]): string | null => {
    const volumeKeywords = [
      'volume', 'sales', 'amount', 'total', 'revenue', 'income', 'gross',
      'processing', 'transaction', 'card', 'payment', 'sum'
    ];
    
    console.log('Detecting volume column from headers:', headers);
    
    // First pass: look for exact matches with volume keywords
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim();
      for (const keyword of volumeKeywords) {
        if (headerLower.includes(keyword) && 
            !headerLower.includes('debit') && 
            !headerLower.includes('refund') && 
            !headerLower.includes('chargeback') &&
            !headerLower.includes('commission') &&
            !headerLower.includes('payout')) {
          console.log('Found volume column:', header);
          return header;
        }
      }
    }
    
    console.log('No volume column detected');
    return null;
  };

  // Smart column detection for commission/payout amounts
  const detectCommissionColumn = (headers: string[]): string | null => {
    const commissionKeywords = [
      'commission', 'payout', 'agent', 'residual', 'fee', 'earnings', 'profit'
    ];
    
    console.log('Detecting commission column from headers:', headers);
    
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim();
      for (const keyword of commissionKeywords) {
        if (headerLower.includes(keyword)) {
          console.log('Found commission column:', header);
          return header;
        }
      }
    }
    
    console.log('No commission column detected');
    return null;
  };

  const detectProcessor = (headers: string[], firstDataRow?: any): string => {
    const headerStr = headers.join('|').toLowerCase();
    
    console.log('Detecting processor from headers:', headers);
    
    // Check for known processor patterns
    if (headerStr.includes('bank card volume') || headerStr.includes('bankcard volume') || headerStr.includes('salescode')) {
      console.log('Detected TRNXN processor');
      return 'TRNXN';
    }
    
    if (headerStr.includes('total amount') && headerStr.includes('sales rep')) {
      console.log('Detected Maverick processor');
      return 'Maverick';
    }
    
    if (headerStr.includes('gross sales') && headerStr.includes('residual')) {
      console.log('Detected SignaPay processor');
      return 'SignaPay';
    }
    
    if (headerStr.includes('processing volume') && headerStr.includes('agent revenue')) {
      console.log('Detected Green Payments processor');
      return 'Green Payments';
    }

    if (headerStr.includes('fiserv') || headerStr.includes('residuals')) {
      console.log('Detected Green Payments processor (Fiserv format)');
      return 'Green Payments';
    }
    
    console.log('Could not detect specific processor, using Generic');
    return 'Generic';
  };

  const processRow = (row: any, processor: string, locationColumn: string | null, volumeColumn: string | null, commissionColumn: string | null): ProcessedData | null => {
    try {
      let processed: ProcessedData = { rawData: row, processor };

      console.log('Processing row for processor:', processor);
      console.log('Row data keys:', Object.keys(row));

      // Handle the specific Green Payments CSV format with __parsed_extra
      if (row.__parsed_extra && Array.isArray(row.__parsed_extra)) {
        const merchantId = Object.values(row)[0] as string;
        const extraData = row.__parsed_extra;
        
        if (extraData.length >= 6) {
          processed.accountId = merchantId;
          processed.locationName = extraData[0] as string;
          processed.volume = parseFloat(extraData[2] as string) || 0;
          processed.agentPayout = parseFloat(extraData[5] as string) || 0;
          processed.debitVolume = 0;
          processed.agentName = null;
        }
      } else {
        // Smart column mapping
        if (locationColumn && row[locationColumn]) {
          processed.locationName = String(row[locationColumn]).trim();
        }
        
        if (volumeColumn && row[volumeColumn]) {
          const volumeValue = String(row[volumeColumn]).replace(/[,$]/g, '');
          processed.volume = parseFloat(volumeValue) || 0;
        }
        
        if (commissionColumn && row[commissionColumn]) {
          const commissionValue = String(row[commissionColumn]).replace(/[,$]/g, '');
          processed.agentPayout = parseFloat(commissionValue) || 0;
        }

        // Set default values
        processed.debitVolume = 0;
        processed.agentName = null;
        
        // Try to find account ID from various possible columns
        const accountColumns = ['account_id', 'mid', 'merchant_id', 'account', 'id'];
        for (const col of accountColumns) {
          const foundCol = Object.keys(row).find(key => key.toLowerCase().includes(col));
          if (foundCol && row[foundCol]) {
            processed.accountId = String(row[foundCol]);
            break;
          }
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
      console.log('=== Starting Smart File Upload Process ===');
      console.log('Selected month:', selectedMonth);
      console.log('File name:', file.name);
      
      const rawData = await parseFile(file);
      console.log('Parsed data length:', rawData.length);
      console.log('Parsed data sample (first 3 rows):', rawData.slice(0, 3));

      if (rawData.length === 0) {
        throw new Error('No data found in file');
      }

      const headers = Object.keys(rawData[0]);
      const detectedProcessor = detectProcessor(headers, rawData[1]);
      
      // Smart column detection
      const locationColumn = detectLocationColumn(headers);
      const volumeColumn = detectVolumeColumn(headers);
      const commissionColumn = detectCommissionColumn(headers);
      
      console.log('Smart column detection results:');
      console.log('- Location column:', locationColumn);
      console.log('- Volume column:', volumeColumn);
      console.log('- Commission column:', commissionColumn);
      console.log('- Detected processor:', detectedProcessor);

      if (!locationColumn && !volumeColumn) {
        throw new Error('Could not detect location or volume columns in the file. Please ensure your file contains recognizable location names and sales/volume amounts.');
      }

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

      console.log('=== Processing Rows with Smart Detection ===');
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        console.log(`\n--- Processing row ${i + 1} ---`);
        const processedData = processRow(row, detectedProcessor, locationColumn, volumeColumn, commissionColumn);

        if (processedData) {
          console.log('Processed data for row', i + 1, ':', {
            volume: processedData.volume,
            debitVolume: processedData.debitVolume,
            agentPayout: processedData.agentPayout,
            agentName: processedData.agentName,
            accountId: processedData.accountId,
            locationName: processedData.locationName
          });

          // Check if we have meaningful data (location name OR volume)
          if (processedData.locationName || (processedData.volume && processedData.volume > 0)) {
            try {
              let locationId = null;
              if (processedData.locationName) {
                const existingLocationId = await ensureLocationExists(processedData.locationName, processedData.accountId);
                if (existingLocationId) {
                  locationId = existingLocationId;
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

              const transactionDate = `${selectedMonth}-01`;

              const transactionData = {
                processor: detectedProcessor,
                volume: processedData.volume || 0,
                debit_volume: processedData.debitVolume || 0,
                agent_payout: processedData.agentPayout || 0,
                agent_name: null,
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
            console.log(`Skipping row ${i + 1} - no valid location or volume data`);
            errorCount++;
            errors.push({ row: i + 1, error: 'No valid location or volume data found' });
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

      await supabase
        .from('file_uploads')
        .update({
          status: errorCount === rawData.length ? 'failed' : 'completed',
          rows_processed: successCount,
          errors: errors.length > 0 ? errors : null
        })
        .eq('id', uploadRecord.id);

      // Invalidate all relevant queries
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

      const successMessage = `Smart upload completed! Processed ${successCount} rows from ${detectedProcessor} for ${monthOptions.find(m => m.value === selectedMonth)?.label}. ${errorCount} errors.${locationsCreated > 0 ? ` Created ${locationsCreated} new locations.` : ''}`;

      setUploadStatus({
        status: errorCount === rawData.length ? 'error' : 'success',
        message: successMessage,
        filename: file.name,
        rowsProcessed: successCount
      });

      toast({
        title: "Smart Upload Complete",
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
          Smart Upload Transaction Data
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
                    Smart detection will find location names and volume automatically
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
          <p className="font-medium mb-1">Smart Upload automatically detects:</p>
          <ul className="space-y-1">
            <li><strong>Location Names:</strong> Business names, merchant names, DBA, store names, etc.</li>
            <li><strong>Volume/Sales:</strong> Sales amounts, processing volume, transaction amounts, revenue, etc.</li>
            <li><strong>Commission:</strong> Agent payouts, commissions, residuals, fees (if available)</li>
            <li><strong>File Format:</strong> Works with any reasonable CSV or Excel file structure</li>
          </ul>
          <p className="mt-2 text-xs"><strong>Note:</strong> The system focuses on location names and sales amounts. Column names can vary - the smart detection will find the right data automatically. Agent assignments are managed separately in the Locations tab.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUpload;
