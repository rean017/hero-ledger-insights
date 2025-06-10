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

interface ProcessorConfig {
  name: string;
  locationColumn: string[];
  volumeColumn: string[];
  commissionColumn: string[];
  detection: string[];
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

  // Processor configurations with specific column mappings
  const processorConfigs: ProcessorConfig[] = [
    {
      name: 'Maverick',
      locationColumn: ['dba name', 'dba_name', 'dba'],
      volumeColumn: ['sales amount', 'sales_amount', 'total sales'],
      commissionColumn: ['agent net revenue', 'agent_net_revenue', 'agent net', 'net revenue'],
      detection: ['dba name', 'sales amount', 'agent net revenue']
    },
    {
      name: 'Green Payments',
      locationColumn: ['merchant', 'merchant name', 'merchant_name'],
      volumeColumn: ['sales amount', 'sales_amount', 'total sales'],
      commissionColumn: ['agent net', 'agent_net', 'net'],
      detection: ['merchant', 'sales amount', 'agent net']
    },
    {
      name: 'TRNXN',
      locationColumn: ['dba', 'dba name', 'dba_name'],
      volumeColumn: ['bankcard volume', 'bankcard_volume', 'bank card volume'],
      commissionColumn: ['net commission', 'net_commission', 'commission'],
      detection: ['dba', 'bankcard volume', 'net commission']
    },
    {
      name: 'SignaPay',
      locationColumn: ['dba', 'dba name', 'dba_name'],
      volumeColumn: ['volume', 'total volume', 'sales volume'],
      commissionColumn: ['net', 'net commission', 'commission'],
      detection: ['dba', 'volume', 'net']
    }
  ];

  // ENHANCED: Ultra-strict DBA business name validation - NEVER allow numeric names
  const isValidBusinessName = (value: string): boolean => {
    if (!value || typeof value !== 'string') {
      console.log('❌ REJECTED: Invalid business name - not a string or empty');
      return false;
    }
    
    const trimmed = value.trim();
    
    // Must not be empty
    if (trimmed.length === 0) {
      console.log('❌ REJECTED: Invalid business name - empty string');
      return false;
    }
    
    // STRICT: Must not be purely numeric (these are account IDs, NOT business names)
    if (/^\d+$/.test(trimmed)) {
      console.log('❌ REJECTED: Purely numeric value is NOT a business name:', trimmed);
      return false;
    }
    
    // STRICT: Must not be mostly numeric (like "123456 CORP" where it's clearly an ID)
    if (/^\d{4,}/.test(trimmed)) {
      console.log('❌ REJECTED: Starts with 4+ digits, likely an account ID:', trimmed);
      return false;
    }
    
    // Must not be very short (likely codes or IDs)
    if (trimmed.length < 3) {
      console.log('❌ REJECTED: Too short to be a valid business name:', trimmed);
      return false;
    }
    
    // Must contain at least one letter (business names MUST have letters)
    if (!/[a-zA-Z]/.test(trimmed)) {
      console.log('❌ REJECTED: No letters found, not a valid business name:', trimmed);
      return false;
    }
    
    // STRICT: Must not be common non-business patterns
    const invalidPatterns = [
      /^account\s*\d+$/i,
      /^mid\s*\d+$/i,
      /^merchant\s*\d+$/i,
      /^id\s*\d+$/i,
      /^\d+\s*account$/i,
      /^loc\s*\d+$/i,
      /^location\s*\d+$/i
    ];
    
    for (const pattern of invalidPatterns) {
      if (pattern.test(trimmed)) {
        console.log('❌ REJECTED: Invalid business name pattern:', trimmed);
        return false;
      }
    }
    
    console.log('✅ VALID BUSINESS NAME CONFIRMED:', trimmed);
    return true;
  };

  // Enhanced processor detection using specific configurations
  const detectProcessor = (headers: string[]): { processor: ProcessorConfig | null; confidence: number } => {
    console.log('=== ENHANCED PROCESSOR DETECTION ===');
    console.log('Available headers:', headers);
    
    const headerLower = headers.map(h => h.toLowerCase().trim());
    
    let bestMatch: { processor: ProcessorConfig | null; confidence: number } = { processor: null, confidence: 0 };
    
    for (const config of processorConfigs) {
      let matchScore = 0;
      let totalDetectionColumns = config.detection.length;
      
      console.log(`\n--- Testing ${config.name} processor ---`);
      
      for (const detectionColumn of config.detection) {
        const found = headerLower.some(header => header.includes(detectionColumn.toLowerCase()));
        if (found) {
          matchScore++;
          console.log(`✅ Found detection column for ${config.name}: ${detectionColumn}`);
        } else {
          console.log(`❌ Missing detection column for ${config.name}: ${detectionColumn}`);
        }
      }
      
      const confidence = matchScore / totalDetectionColumns;
      console.log(`${config.name} confidence: ${confidence} (${matchScore}/${totalDetectionColumns})`);
      
      if (confidence > bestMatch.confidence) {
        bestMatch = { processor: config, confidence };
      }
    }
    
    if (bestMatch.processor && bestMatch.confidence >= 0.6) {
      console.log(`🎯 DETECTED: ${bestMatch.processor.name} with ${(bestMatch.confidence * 100).toFixed(1)}% confidence`);
      return bestMatch;
    }
    
    console.log('⚠️ Could not detect processor with sufficient confidence');
    return { processor: null, confidence: 0 };
  };

  // Find column by possible names
  const findColumn = (headers: string[], possibleNames: string[]): string | null => {
    const headerLower = headers.map(h => h.toLowerCase().trim());
    
    for (const name of possibleNames) {
      const index = headerLower.findIndex(header => 
        header === name.toLowerCase() || 
        header.includes(name.toLowerCase()) ||
        header.replace(/[\s_-]/g, '') === name.replace(/[\s_-]/g, '').toLowerCase()
      );
      
      if (index !== -1) {
        console.log(`Found column "${headers[index]}" for "${name}"`);
        return headers[index];
      }
    }
    
    console.log(`Column not found for any of: ${possibleNames.join(', ')}`);
    return null;
  };

  // FIXED: Enhanced row processing with processor-specific column mapping
  const processRow = (row: any, processorConfig: ProcessorConfig, locationColumn: string | null, volumeColumn: string | null, commissionColumn: string | null): ProcessedData | null => {
    try {
      let processed: ProcessedData = { rawData: row, processor: processorConfig.name };

      console.log('\n=== PROCESSING ROW WITH PROCESSOR-SPECIFIC MAPPING ===');
      console.log('Processor:', processorConfig.name);
      console.log('Location column:', locationColumn);
      console.log('Volume column:', volumeColumn);
      console.log('Commission column:', commissionColumn);

      // Handle the specific Green Payments CSV format with __parsed_extra
      if (row.__parsed_extra && Array.isArray(row.__parsed_extra)) {
        const merchantId = Object.values(row)[0] as string;
        const extraData = row.__parsed_extra;
        
        if (extraData.length >= 6) {
          const businessName = extraData[0] as string;
          
          // CRITICAL: Validate business name for Green Payments format too
          if (!isValidBusinessName(businessName)) {
            console.log('❌ REJECTED: Green Payments row has invalid business name:', businessName);
            return null;
          }
          
          processed.accountId = merchantId;
          processed.locationName = businessName;
          processed.volume = parseFloat(extraData[2] as string) || 0;
          processed.agentPayout = parseFloat(extraData[5] as string) || 0;
          processed.debitVolume = 0;
          processed.agentName = null;
        }
      } else {
        // CRITICAL: Location name detection with ZERO tolerance for numeric names
        if (!locationColumn) {
          console.log('❌ FATAL ERROR: No location column detected - cannot process row');
          return null;
        }

        if (!row[locationColumn]) {
          console.log('❌ REJECTED: Location column is empty for this row');
          return null;
        }

        const locationValue = String(row[locationColumn]).trim();
        console.log('Raw location value from column', locationColumn, ':', locationValue);
        
        // ULTRA-STRICT: Business name validation - NEVER allow numeric names
        if (!isValidBusinessName(locationValue)) {
          console.log('❌ CRITICAL REJECTION: Location value failed strict validation:', locationValue);
          console.log('❌ This row will be SKIPPED to prevent numeric location names');
          return null;
        }

        processed.locationName = locationValue;
        console.log('✅ CONFIRMED: Valid business name set:', processed.locationName);
        
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
          console.log('✅ Set commission to:', processed.agentPayout);
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

      console.log('=== FINAL VALIDATION ===');
      console.log('Location Name:', processed.locationName);
      console.log('Volume:', processed.volume);
      console.log('Commission:', processed.agentPayout);
      console.log('Account ID:', processed.accountId);

      // FINAL MANDATORY VALIDATION: Ensure we have a proper business name
      if (!processed.locationName || !isValidBusinessName(processed.locationName)) {
        console.log('❌ FINAL REJECTION: No valid business name found - ROW WILL BE SKIPPED');
        return null;
      }

      console.log('✅ ROW APPROVED: Valid business name confirmed for processing');
      return processed;
    } catch (error) {
      console.error('❌ Error processing row:', error);
      return null;
    }
  };

  // ENHANCED: Location creation with business name validation
  const ensureLocationExists = async (locationName: string, accountId?: string): Promise<string | null> => {
    if (!locationName || !isValidBusinessName(locationName)) {
      console.log('❌ CRITICAL: Attempting to create location with invalid business name:', locationName);
      return null;
    }

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
        console.log('✅ Found existing location with business name:', locationName);
        return existingLocation.id;
      }

      console.log('✅ Creating new location with validated business name:', locationName);
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

      console.log('✅ Successfully created location with business name:', newLocation);
      return newLocation.id;
    } catch (error) {
      console.error('Error in ensureLocationExists:', error);
      return null;
    }
  };

  // NEW: Create or update Merchant Hero agent assignment with calculated BPS rate
  const createMerchantHeroAssignment = async (locationId: string, volume: number, netCommission: number): Promise<void> => {
    try {
      // Calculate BPS rate: (Net Commission ÷ Volume) × 10,000
      let bpsRate = 0;
      if (volume > 0 && netCommission > 0) {
        bpsRate = (netCommission / volume) * 10000;
        console.log(`Calculated Merchant Hero BPS rate: ${bpsRate} (${netCommission} ÷ ${volume} × 10,000)`);
      }

      // Store as decimal rate for database (BPS ÷ 10,000)
      const decimalRate = bpsRate / 10000;

      // Check if Merchant Hero assignment already exists for this location
      const { data: existingAssignment, error: selectError } = await supabase
        .from('location_agent_assignments')
        .select('id, commission_rate')
        .eq('location_id', locationId)
        .eq('agent_name', 'Merchant Hero')
        .eq('is_active', true)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('Error checking existing Merchant Hero assignment:', selectError);
        return;
      }

      if (existingAssignment) {
        // Update existing assignment with new rate
        const { error: updateError } = await supabase
          .from('location_agent_assignments')
          .update({
            commission_rate: decimalRate,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingAssignment.id);

        if (updateError) {
          console.error('Error updating Merchant Hero assignment:', updateError);
        } else {
          console.log(`✅ Updated Merchant Hero assignment with ${bpsRate.toFixed(2)} BPS rate`);
        }
      } else {
        // Create new assignment
        const { error: insertError } = await supabase
          .from('location_agent_assignments')
          .insert({
            location_id: locationId,
            agent_name: 'Merchant Hero',
            commission_rate: decimalRate,
            is_active: true
          });

        if (insertError) {
          console.error('Error creating Merchant Hero assignment:', insertError);
        } else {
          console.log(`✅ Created Merchant Hero assignment with ${bpsRate.toFixed(2)} BPS rate`);
        }
      }
    } catch (error) {
      console.error('Error in createMerchantHeroAssignment:', error);
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
    setUploadStatus({ status: 'processing', message: 'Processing file with enhanced processor detection...', filename: file.name });

    try {
      console.log('=== STARTING ENHANCED PROCESSOR-SPECIFIC UPLOAD WITH MERCHANT HERO AUTO-ASSIGNMENT ===');
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
      
      // Enhanced processor detection
      const { processor: detectedProcessor, confidence } = detectProcessor(headers);
      
      if (!detectedProcessor) {
        throw new Error('Could not detect processor type. Please ensure your file matches one of the supported formats: Maverick, Green Payments, TRNXN, or SignaPay.');
      }

      console.log(`=== PROCESSOR DETECTED: ${detectedProcessor.name} (${(confidence * 100).toFixed(1)}% confidence) ===`);
      
      // Find columns using processor-specific mappings
      const locationColumn = findColumn(headers, detectedProcessor.locationColumn);
      const volumeColumn = findColumn(headers, detectedProcessor.volumeColumn);
      const commissionColumn = findColumn(headers, detectedProcessor.commissionColumn);
      
      console.log('=== COLUMN MAPPING ===');
      console.log('- Location column:', locationColumn);
      console.log('- Volume column:', volumeColumn);
      console.log('- Commission column:', commissionColumn);

      if (!locationColumn) {
        throw new Error(`CRITICAL ERROR: No location column found for ${detectedProcessor.name}! Expected columns: ${detectedProcessor.locationColumn.join(', ')}`);
      }

      if (!volumeColumn) {
        throw new Error(`Could not detect volume column for ${detectedProcessor.name}. Expected columns: ${detectedProcessor.volumeColumn.join(', ')}`);
      }

      const [year, month] = selectedMonth.split('-');
      const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endDate = `${selectedMonth}-${lastDayOfMonth}`;

      console.log('Deleting existing transactions for processor:', detectedProcessor.name, 'and month:', selectedMonth);
      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('processor', detectedProcessor.name)
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
          processor: detectedProcessor.name,
          status: 'processing'
        })
        .select()
        .single();

      if (uploadError) throw uploadError;
      console.log('Created upload record:', uploadRecord);

      let successCount = 0;
      let errorCount = 0;
      let locationsCreated = 0;
      let merchantHeroAssignments = 0;
      const errors: any[] = [];

      console.log('=== PROCESSING ROWS WITH PROCESSOR-SPECIFIC VALIDATION AND MERCHANT HERO ASSIGNMENT ===');
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        console.log(`\n--- Processing row ${i + 1} with ${detectedProcessor.name} format ---`);
        const processedData = processRow(row, detectedProcessor, locationColumn, volumeColumn, commissionColumn);

        if (processedData && processedData.locationName) {
          console.log('✅ APPROVED: Valid business name for row', i + 1, ':', processedData.locationName);

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

                // Create Merchant Hero assignment with calculated BPS rate
                if (processedData.volume && processedData.agentPayout) {
                  await createMerchantHeroAssignment(existingLocationId, processedData.volume, processedData.agentPayout);
                  merchantHeroAssignments++;
                }
              }
            }

            const transactionDate = `${selectedMonth}-01`;

            const transactionData = {
              processor: detectedProcessor.name,
              volume: processedData.volume || 0,
              debit_volume: processedData.debitVolume || 0,
              agent_payout: processedData.agentPayout || 0,
              agent_name: null,
              account_id: processedData.accountId,
              transaction_date: transactionDate,
              raw_data: processedData.rawData
            };

            console.log('Inserting transaction with business name:', processedData.locationName);

            const { error } = await supabase
              .from('transactions')
              .insert(transactionData);

            if (error) {
              console.error('❌ Database insertion error for row', i + 1, ':', error);
              errorCount++;
              errors.push({ row: i + 1, error: error.message });
            } else {
              successCount++;
              console.log(`✅ SUCCESS: Row ${i + 1} processed with business name: ${processedData.locationName}`);
            }
          } catch (error) {
            console.error('❌ Error processing row', i + 1, ':', error);
            errorCount++;
            errors.push({ row: i + 1, error: String(error) });
          }
        } else {
          console.log(`❌ REJECTED: Row ${i + 1} - no valid business name found (NUMERIC NAMES ARE STRICTLY FORBIDDEN)`);
          errorCount++;
          errors.push({ row: i + 1, error: 'No valid business name found - numeric names are not allowed' });
        }
      }

      console.log('=== UPLOAD SUMMARY ===');
      console.log('Processor:', detectedProcessor.name);
      console.log('Success count:', successCount);
      console.log('Error count:', errorCount);
      console.log('Locations created with business names:', locationsCreated);
      console.log('Merchant Hero assignments created/updated:', merchantHeroAssignments);
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
      queryClient.invalidateQueries({ queryKey: ['numeric-locations'] });

      const successMessage = `${detectedProcessor.name} upload completed! Processed ${successCount} rows with proper business names for ${monthOptions.find(m => m.value === selectedMonth)?.label}. ${errorCount} rows rejected for having numeric names. ${locationsCreated > 0 ? ` Created ${locationsCreated} new locations using ONLY proper business names.` : ''} ${merchantHeroAssignments > 0 ? ` Automatically assigned Merchant Hero to ${merchantHeroAssignments} locations with calculated BPS rates.` : ''}`;

      setUploadStatus({
        status: errorCount === rawData.length ? 'error' : 'success',
        message: successMessage,
        filename: file.name,
        rowsProcessed: successCount
      });

      toast({
        title: `${detectedProcessor.name} Upload Complete`,
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
          Smart Processor Detection Upload
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
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    <strong>AUTO-DETECT:</strong> Maverick, Green Payments, TRNXN, or SignaPay formats
                  </p>
                  <p className="text-xs text-blue-600 mt-1 font-medium">
                    <strong>AUTO-ASSIGN:</strong> Merchant Hero with calculated BPS rates
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

        <div className="text-xs text-muted-foreground bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="font-medium mb-2 text-green-800">✅ Supported Upload Formats:</p>
          <ul className="space-y-1 text-green-700">
            <li><strong>Maverick:</strong> DBA Name, Sales Amount, Agent Net Revenue</li>
            <li><strong>Green Payments:</strong> Merchant, Sales Amount, Agent Net</li>
            <li><strong>TRNXN:</strong> DBA, Bankcard Volume, Net Commission</li>
            <li><strong>SignaPay:</strong> DBA, Volume, Net</li>
          </ul>
          <p className="mt-2 text-sm font-medium text-green-800">
            <strong>🔍 AUTOMATIC DETECTION:</strong> System will detect your processor type automatically
          </p>
        </div>

        <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="font-medium mb-2 text-blue-800">🤖 MERCHANT HERO AUTO-ASSIGNMENT:</p>
          <ul className="space-y-1 text-blue-700">
            <li><strong>✅ AUTO-CALCULATE:</strong> BPS rates based on Volume vs Net Commission</li>
            <li><strong>✅ AUTO-ASSIGN:</strong> Merchant Hero as agent to every location</li>
            <li><strong>✅ AUTO-UPDATE:</strong> Existing assignments with new calculated rates</li>
            <li><strong>✅ FORMULA:</strong> (Net Commission ÷ Volume) × 10,000 = BPS Rate</li>
          </ul>
        </div>

        <div className="text-xs text-muted-foreground bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="font-medium mb-2 text-red-800">🚫 ZERO TOLERANCE for Numeric Location Names:</p>
          <ul className="space-y-1 text-red-700">
            <li><strong>❌ STRICTLY FORBIDDEN:</strong> Numeric values like "100336", "12345"</li>
            <li><strong>❌ STRICTLY FORBIDDEN:</strong> Account ID patterns</li>
            <li><strong>❌ STRICTLY FORBIDDEN:</strong> Values with no letters</li>
            <li><strong>✅ REQUIRED:</strong> Proper business names like "Joe's Restaurant"</li>
          </ul>
          <p className="mt-2 text-sm font-medium text-red-800">
            <strong>⚠️ ANY ROW WITH NUMERIC NAMES WILL BE COMPLETELY REJECTED</strong>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUpload;
