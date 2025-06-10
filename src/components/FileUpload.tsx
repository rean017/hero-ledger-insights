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

  // Enhanced DBA detection - MUST find actual business names, not account numbers
  const detectLocationColumn = (headers: string[]): string | null => {
    console.log('=== DBA Detection Process ===');
    console.log('Available headers:', headers);
    
    // HIGHEST PRIORITY: Look for exact "DBA" match (case insensitive)
    const exactDbaColumn = headers.find(header => 
      header.toLowerCase().trim() === 'dba'
    );
    if (exactDbaColumn) {
      console.log('✅ Found exact DBA column:', exactDbaColumn);
      return exactDbaColumn;
    }
    
    // SECOND PRIORITY: Look for "DBA Name" variations
    const dbaNameVariations = ['dba name', 'dba_name', 'dbaname'];
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim().replace(/[\s_-]/g, '');
      for (const variation of dbaNameVariations) {
        const variationClean = variation.replace(/[\s_-]/g, '');
        if (headerLower === variationClean) {
          console.log('✅ Found DBA Name variation:', header);
          return header;
        }
      }
    }
    
    // THIRD PRIORITY: Look for DBA-related patterns
    const dbaPatterns = ['dba', 'doing business as', 'business name', 'merchant name'];
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim();
      for (const pattern of dbaPatterns) {
        if (headerLower.includes(pattern)) {
          console.log('✅ Found DBA pattern match:', header, 'contains', pattern);
          return header;
        }
      }
    }
    
    // FOURTH PRIORITY: Look for business-related terms (but avoid account/ID columns)
    const businessKeywords = ['merchant', 'business', 'store', 'shop', 'company', 'name', 'location'];
    const avoidKeywords = ['account', 'id', 'number', 'code', 'mid'];
    
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim();
      
      // Skip if it contains avoid keywords (likely numeric IDs)
      const hasAvoidKeyword = avoidKeywords.some(avoid => headerLower.includes(avoid));
      if (hasAvoidKeyword) {
        console.log('❌ Skipping potential ID column:', header);
        continue;
      }
      
      // Check for business-related keywords
      for (const keyword of businessKeywords) {
        if (headerLower.includes(keyword)) {
          console.log('✅ Found business name column:', header);
          return header;
        }
      }
    }
    
    console.log('❌ No DBA/location column detected');
    return null;
  };

  // Enhanced volume detection - prioritizes Sales Amount
  const detectVolumeColumn = (headers: string[]): string | null => {
    console.log('=== Volume Detection Process ===');
    console.log('Available headers:', headers);
    
    // HIGHEST PRIORITY: Look for exact "Sales Amount" match
    const exactSalesAmountColumn = headers.find(header => 
      header.toLowerCase().trim() === 'sales amount'
    );
    if (exactSalesAmountColumn) {
      console.log('✅ Found exact Sales Amount column:', exactSalesAmountColumn);
      return exactSalesAmountColumn;
    }
    
    // SECOND PRIORITY: Look for Sales Amount variations
    const salesAmountVariations = ['sales_amount', 'salesamount', 'total sales', 'sales total'];
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim().replace(/[\s_-]/g, '');
      for (const variation of salesAmountVariations) {
        const variationClean = variation.replace(/[\s_-]/g, '');
        if (headerLower === variationClean) {
          console.log('✅ Found Sales Amount variation:', header);
          return header;
        }
      }
    }
    
    // THIRD PRIORITY: Look for other volume keywords (excluding count columns)
    const volumeKeywords = ['volume', 'sales', 'revenue', 'income', 'gross', 'processing', 'amount'];
    const countKeywords = ['count', 'number', 'qty', 'quantity', 'transactions', 'items'];
    
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim();
      
      // Skip if this looks like a count column
      const isCountColumn = countKeywords.some(keyword => headerLower.includes(keyword));
      if (isCountColumn) {
        console.log('❌ Skipping count column:', header);
        continue;
      }
      
      for (const keyword of volumeKeywords) {
        if (headerLower.includes(keyword) && 
            !headerLower.includes('debit') && 
            !headerLower.includes('refund') && 
            !headerLower.includes('chargeback') &&
            !headerLower.includes('commission') &&
            !headerLower.includes('payout')) {
          console.log('✅ Found volume column:', header);
          return header;
        }
      }
    }
    
    console.log('❌ No volume column detected');
    return null;
  };

  // Smart column detection for commission/payout amounts
  const detectCommissionColumn = (headers: string[]): string | null => {
    const commissionKeywords = [
      'commission', 'payout', 'agent', 'residual', 'fee', 'earnings', 'profit'
    ];
    
    console.log('=== Commission Detection Process ===');
    
    for (const header of headers) {
      const headerLower = header.toLowerCase().trim();
      for (const keyword of commissionKeywords) {
        if (headerLower.includes(keyword)) {
          console.log('✅ Found commission column:', header);
          return header;
        }
      }
    }
    
    console.log('❌ No commission column detected');
    return null;
  };

  const detectProcessor = (headers: string[], firstDataRow?: any): string => {
    const headerStr = headers.join('|').toLowerCase();
    
    console.log('=== Processor Detection ===');
    console.log('Headers for detection:', headers);
    
    // Check for DBA + Sales Amount pattern (likely a specific format)
    if (headerStr.includes('dba') && headerStr.includes('sales amount')) {
      console.log('✅ Detected DBA + Sales Amount format, using Maverick processor');
      return 'Maverick';
    }
    
    // Check for known processor patterns
    if (headerStr.includes('bank card volume') || headerStr.includes('bankcard volume') || headerStr.includes('salescode')) {
      console.log('✅ Detected TRNXN processor');
      return 'TRNXN';
    }
    
    if (headerStr.includes('total amount') && headerStr.includes('sales rep')) {
      console.log('✅ Detected Maverick processor');
      return 'Maverick';
    }
    
    if (headerStr.includes('gross sales') && headerStr.includes('residual')) {
      console.log('✅ Detected SignaPay processor');
      return 'SignaPay';
    }
    
    if (headerStr.includes('processing volume') && headerStr.includes('agent revenue')) {
      console.log('✅ Detected Green Payments processor');
      return 'Green Payments';
    }

    if (headerStr.includes('fiserv') || headerStr.includes('residuals')) {
      console.log('✅ Detected Green Payments processor (Fiserv format)');
      return 'Green Payments';
    }
    
    // Check for common agent-related patterns that might indicate Maverick
    if (headerStr.includes('agent') && (headerStr.includes('payout') || headerStr.includes('commission'))) {
      console.log('✅ Detected Maverick processor (agent pattern)');
      return 'Maverick';
    }
    
    // Default to Maverick (as it seems to be a common format)
    console.log('⚠️ Could not detect specific processor, defaulting to Maverick');
    return 'Maverick';
  };

  // Improved location name validation - must be a real business name
  const isValidLocationName = (value: string): boolean => {
    if (!value || typeof value !== 'string') {
      return false;
    }
    
    const trimmed = value.trim();
    
    // Must not be empty
    if (trimmed.length === 0) {
      return false;
    }
    
    // Must not be purely numeric (account numbers)
    if (/^\d+$/.test(trimmed)) {
      console.log('❌ Rejecting purely numeric value as location name:', trimmed);
      return false;
    }
    
    // Must not be very short (likely codes)
    if (trimmed.length < 3) {
      console.log('❌ Rejecting too short value as location name:', trimmed);
      return false;
    }
    
    // Must contain at least one letter (business names have letters)
    if (!/[a-zA-Z]/.test(trimmed)) {
      console.log('❌ Rejecting value with no letters as location name:', trimmed);
      return false;
    }
    
    console.log('✅ Valid location name:', trimmed);
    return true;
  };

  const processRow = (row: any, processor: string, locationColumn: string | null, volumeColumn: string | null, commissionColumn: string | null): ProcessedData | null => {
    try {
      let processed: ProcessedData = { rawData: row, processor };

      console.log('\n=== Processing Row ===');
      console.log('Processor:', processor);
      console.log('Row data keys:', Object.keys(row));
      console.log('Target location column:', locationColumn);
      console.log('Target volume column:', volumeColumn);

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
        // Enhanced DBA location name detection and validation
        if (locationColumn && row[locationColumn]) {
          const locationValue = String(row[locationColumn]).trim();
          console.log('Raw location value from column', locationColumn, ':', locationValue);
          
          if (isValidLocationName(locationValue)) {
            processed.locationName = locationValue;
            console.log('✅ Set location name to:', processed.locationName);
          } else {
            console.log('❌ Location value failed validation, searching for alternative...');
            
            // Search all columns for a valid DBA/business name
            for (const [key, value] of Object.entries(row)) {
              const keyLower = key.toLowerCase();
              const valueStr = String(value).trim();
              
              // Look for any column that might contain DBA or business name
              if ((keyLower.includes('dba') || keyLower.includes('business') || keyLower.includes('merchant') || keyLower.includes('name')) 
                  && isValidLocationName(valueStr)) {
                processed.locationName = valueStr;
                console.log('✅ Found valid DBA in alternate column:', key, '=', valueStr);
                break;
              }
            }
            
            // If still no valid location name found, this row is invalid
            if (!processed.locationName) {
              console.log('❌ No valid location name found in any column');
              return null;
            }
          }
        }
        
        // Volume detection
        if (volumeColumn && row[volumeColumn]) {
          const volumeValue = String(row[volumeColumn]).replace(/[,$]/g, '');
          processed.volume = parseFloat(volumeValue) || 0;
          console.log('✅ Set volume to:', processed.volume);
        }
        
        // Commission detection
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

      console.log('=== Final processed data ===');
      console.log('Location Name:', processed.locationName);
      console.log('Volume:', processed.volume);
      console.log('Account ID:', processed.accountId);

      return processed;
    } catch (error) {
      console.error('❌ Error processing row:', error);
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
    setUploadStatus({ status: 'processing', message: 'Processing file with enhanced DBA detection...', filename: file.name });

    try {
      console.log('=== Starting Enhanced DBA File Upload Process ===');
      console.log('Selected month:', selectedMonth);
      console.log('File name:', file.name);
      
      const rawData = await parseFile(file);
      console.log('Parsed data length:', rawData.length);
      console.log('Parsed data sample (first 3 rows):', rawData.slice(0, 3));

      if (rawData.length === 0) {
        throw new Error('No data found in file');
      }

      const headers = Object.keys(rawData[0]);
      console.log('All headers found:', headers);
      
      const detectedProcessor = detectProcessor(headers, rawData[1]);
      
      // Enhanced column detection with strict DBA validation
      const locationColumn = detectLocationColumn(headers);
      const volumeColumn = detectVolumeColumn(headers);
      const commissionColumn = detectCommissionColumn(headers);
      
      console.log('=== Enhanced Column Detection Results ===');
      console.log('- DBA Location column:', locationColumn);
      console.log('- Sales Amount volume column:', volumeColumn);
      console.log('- Commission column:', commissionColumn);
      console.log('- Detected processor:', detectedProcessor);

      if (!locationColumn) {
        throw new Error('Could not detect DBA column in the file. Please ensure your file contains a "DBA" or "DBA Name" column with business names.');
      }

      if (!volumeColumn) {
        throw new Error('Could not detect Sales Amount column in the file. Please ensure your file contains a "Sales Amount" column with volume data.');
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

      console.log('=== Processing Rows with Enhanced DBA Validation ===');
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        console.log(`\n--- Processing row ${i + 1} ---`);
        const processedData = processRow(row, detectedProcessor, locationColumn, volumeColumn, commissionColumn);

        if (processedData && processedData.locationName) {
          console.log('✅ Valid processed data for row', i + 1, ':', {
            locationName: processedData.locationName,
            volume: processedData.volume,
            accountId: processedData.accountId
          });

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
              console.error('❌ Database insertion error for row', i + 1, ':', error);
              errorCount++;
              errors.push({ row: i + 1, error: error.message });
            } else {
              successCount++;
              console.log(`✅ Successfully inserted row ${i + 1}`);
            }
          } catch (error) {
            console.error('❌ Error processing row', i + 1, ':', error);
            errorCount++;
            errors.push({ row: i + 1, error: String(error) });
          }
        } else {
          console.log(`❌ Skipping row ${i + 1} - no valid DBA location name found`);
          errorCount++;
          errors.push({ row: i + 1, error: 'No valid DBA location name found' });
        }
      }

      console.log('=== Upload Summary ===');
      console.log('Success count:', successCount);
      console.log('Error count:', errorCount);
      console.log('Locations created:', locationsCreated);
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

      const successMessage = `Enhanced DBA upload completed! Processed ${successCount} rows from ${detectedProcessor} for ${monthOptions.find(m => m.value === selectedMonth)?.label}. ${errorCount} errors.${locationsCreated > 0 ? ` Created ${locationsCreated} new locations using proper DBA business names.` : ''}`;

      setUploadStatus({
        status: errorCount === rawData.length ? 'error' : 'success',
        message: successMessage,
        filename: file.name,
        rowsProcessed: successCount
      });

      toast({
        title: "Enhanced DBA Upload Complete",
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
          Enhanced DBA Business Name Upload
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
                    <strong>Required:</strong> DBA column (business names) and Sales Amount column (volume)
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
          <p className="font-medium mb-1">Enhanced DBA Business Name Detection:</p>
          <ul className="space-y-1">
            <li><strong>✅ Priority 1:</strong> Exact "DBA" column match</li>
            <li><strong>✅ Priority 2:</strong> "DBA Name" variations</li>
            <li><strong>✅ Priority 3:</strong> DBA-related patterns</li>
            <li><strong>✅ Priority 4:</strong> Business/merchant name columns</li>
            <li><strong>❌ Rejection:</strong> Purely numeric values (account numbers)</li>
            <li><strong>❌ Rejection:</strong> Values with no letters</li>
            <li><strong>❌ Rejection:</strong> Very short codes</li>
          </ul>
          <p className="mt-2 text-xs font-medium text-green-700">
            <strong>Result:</strong> Locations will now display proper business names like "Joe's Crab Shack" instead of numeric account IDs.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUpload;
