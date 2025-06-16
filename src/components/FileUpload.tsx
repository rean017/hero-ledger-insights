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
  debitVolumeColumn?: string[];
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

  // Enhanced processor configurations with better debit volume detection for TRNXN
  const processorConfigs: ProcessorConfig[] = [
    {
      name: 'Maverick',
      locationColumn: ['dba name', 'dba_name', 'dba'],
      volumeColumn: ['sales amount', 'sales_amount', 'total sales', 'volume'],
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
      volumeColumn: ['bankcard volume', 'bankcard_volume', 'bank card volume', 'bank card vol', 'bankcard vol', 'volume'],
      debitVolumeColumn: ['debit card volume', 'debit_card_volume', 'debitcard volume', 'debit vol', 'debit card vol', 'debit volume', 'debit card', 'debitcard'],
      commissionColumn: ['net commission', 'net_commission', 'commission'],
      detection: ['dba', 'volume', 'commission']
    },
    {
      name: 'SignaPay',
      locationColumn: ['dba', 'dba name', 'dba_name'],
      volumeColumn: ['volume', 'total volume', 'sales volume'],
      commissionColumn: ['net', 'net commission', 'commission'],
      detection: ['dba', 'volume', 'net']
    }
  ];

  // SIMPLIFIED: Basic location name validation - only check for empty values
  const isValidLocationName = (value: string): boolean => {
    if (!value || typeof value !== 'string') {
      console.log('❌ REJECTED: Invalid location name - not a string or empty');
      return false;
    }
    
    const trimmed = value.trim();
    
    // Must not be empty
    if (trimmed.length === 0) {
      console.log('❌ REJECTED: Invalid location name - empty string');
      return false;
    }
    
    console.log('✅ VALID LOCATION NAME CONFIRMED:', trimmed);
    return true;
  };

  // ENHANCED: Detect Green Payments format with __parsed_extra
  const detectGreenPaymentsFormat = (rawData: any[]): boolean => {
    if (!rawData || rawData.length === 0) return false;
    
    // Check if we have the Green Payments format with __parsed_extra
    const firstRow = rawData[0];
    if (firstRow && firstRow.__parsed_extra && Array.isArray(firstRow.__parsed_extra)) {
      console.log('🎯 DETECTED: Green Payments format with __parsed_extra structure');
      
      // Look for the header row pattern
      const extraData = firstRow.__parsed_extra;
      if (extraData.length >= 6) {
        const possibleHeaders = extraData.map(h => String(h).toLowerCase());
        console.log('Green Payments headers in __parsed_extra:', possibleHeaders);
        
        // Check for Green Payments specific headers
        const hasGreenPaymentsHeaders = possibleHeaders.some(h => 
          h.includes('merchant') || h.includes('sales amount') || h.includes('agent net')
        );
        
        if (hasGreenPaymentsHeaders) {
          console.log('✅ Confirmed Green Payments format');
          return true;
        }
      }
    }
    
    return false;
  };

  // Enhanced processor detection using specific configurations
  const detectProcessor = (headers: string[], rawData: any[]): { processor: ProcessorConfig | null; confidence: number } => {
    console.log('=== ENHANCED PROCESSOR DETECTION ===');
    console.log('Available headers:', headers);
    
    // FIRST: Check for Green Payments special format
    if (detectGreenPaymentsFormat(rawData)) {
      const greenPaymentsConfig = processorConfigs.find(c => c.name === 'Green Payments');
      if (greenPaymentsConfig) {
        console.log('🎯 DETECTED: Green Payments with special __parsed_extra format');
        return { processor: greenPaymentsConfig, confidence: 1.0 };
      }
    }
    
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

  // ENHANCED: Better column finding with fuzzy matching for TRNXN
  const findColumn = (headers: string[], possibleNames: string[]): string | null => {
    const headerLower = headers.map(h => h.toLowerCase().trim());
    
    console.log(`🔍 SEARCHING FOR COLUMN among headers:`, headers);
    console.log(`🔍 Looking for any of these names:`, possibleNames);
    
    for (const name of possibleNames) {
      const nameLower = name.toLowerCase();
      
      // Exact match first
      const exactIndex = headerLower.findIndex(header => header === nameLower);
      if (exactIndex !== -1) {
        console.log(`✅ EXACT MATCH FOUND "${headers[exactIndex]}" for search term "${name}"`);
        return headers[exactIndex];
      }
      
      // Contains match
      const containsIndex = headerLower.findIndex(header => header.includes(nameLower));
      if (containsIndex !== -1) {
        console.log(`✅ CONTAINS MATCH FOUND "${headers[containsIndex]}" for search term "${name}"`);
        return headers[containsIndex];
      }
      
      // Fuzzy match (remove spaces, underscores, hyphens)
      const normalizedName = nameLower.replace(/[\s_-]/g, '');
      const fuzzyIndex = headerLower.findIndex(header => 
        header.replace(/[\s_-]/g, '') === normalizedName
      );
      if (fuzzyIndex !== -1) {
        console.log(`✅ FUZZY MATCH FOUND "${headers[fuzzyIndex]}" for search term "${name}"`);
        return headers[fuzzyIndex];
      }
    }
    
    console.log(`❌ COLUMN NOT FOUND for any of: ${possibleNames.join(', ')}`);
    return null;
  };

  // ENHANCED: Row processing with ZERO VOLUME FILTERING
  const processRow = (row: any, processorConfig: ProcessorConfig, locationColumn: string | null, volumeColumn: string | null, debitVolumeColumn: string | null, commissionColumn: string | null): ProcessedData | null => {
    try {
      let processed: ProcessedData = { rawData: row, processor: processorConfig.name };

      console.log('\n=== PROCESSING ROW WITH ZERO VOLUME FILTERING ===');
      console.log('Processor:', processorConfig.name);
      
      // Check if this is a Greenlight row
      const rowString = JSON.stringify(row).toLowerCase();
      const isGreenlight = rowString.includes('greenlight');
      
      if (isGreenlight) {
        console.log('🟢🟢🟢 GREENLIGHT ROW DETECTED! 🟢🟢🟢');
      }

      // ENHANCED: Handle the specific Green Payments CSV format with __parsed_extra
      if (row.__parsed_extra && Array.isArray(row.__parsed_extra) && processorConfig.name === 'Green Payments') {
        const merchantId = Object.values(row)[0] as string;
        const extraData = row.__parsed_extra;
        
        console.log('🎯 Processing Green Payments __parsed_extra format');
        console.log('Merchant ID:', merchantId);
        console.log('Extra data:', extraData);
        
        if (extraData.length >= 6) {
          const locationName = extraData[0] as string;
          
          if (!isValidLocationName(locationName)) {
            console.log('❌ REJECTED: Green Payments row has invalid location name:', locationName);
            return null;
          }
          
          processed.accountId = merchantId;
          processed.locationName = locationName;
          processed.volume = parseFloat(extraData[2] as string) || 0;
          processed.agentPayout = parseFloat(extraData[5] as string) || 0;
          processed.debitVolume = 0;
          processed.agentName = null;
          
          console.log('✅ Green Payments row processed successfully:', {
            locationName: processed.locationName,
            volume: processed.volume,
            agentPayout: processed.agentPayout
          });
        } else {
          console.log('❌ REJECTED: Green Payments row has insufficient data');
          return null;
        }
      } else {
        // Handle other processor formats (including Maverick)
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
        
        if (!isValidLocationName(locationValue)) {
          console.log('❌ REJECTION: Location value failed validation:', locationValue);
          return null;
        }

        processed.locationName = locationValue;
        console.log('✅ CONFIRMED: Valid location name set:', processed.locationName);
        
        // Process volume
        if (volumeColumn && row[volumeColumn] !== undefined) {
          const rawVolumeValue = row[volumeColumn];
          
          // Handle different volume formats
          let volumeValue = String(rawVolumeValue);
          
          // Remove currency symbols, commas, and parentheses
          volumeValue = volumeValue.replace(/[\$,()]/g, '');
          
          // Handle negative values in parentheses format
          const isNegative = String(rawVolumeValue).includes('(') && String(rawVolumeValue).includes(')');
          
          const parsedVolume = parseFloat(volumeValue) || 0;
          processed.volume = isNegative ? -parsedVolume : parsedVolume;
          
          console.log('✅ Set volume to:', processed.volume);
        } else {
          processed.volume = 0;
        }
        
        // ENHANCED: Handle debit volume separately for TRNXN with better detection
        if (debitVolumeColumn && row[debitVolumeColumn]) {
          const debitVolumeValue = String(row[debitVolumeColumn]).replace(/[,$]/g, '');
          processed.debitVolume = parseFloat(debitVolumeValue) || 0;
          console.log('✅ Set debit card volume to:', processed.debitVolume);
        } else {
          processed.debitVolume = 0;
        }
        
        // Process commission
        if (commissionColumn && row[commissionColumn] !== undefined) {
          const rawCommissionValue = row[commissionColumn];
          
          let commissionValue = String(rawCommissionValue);
          commissionValue = commissionValue.replace(/[\$,()]/g, '');
          
          const isNegative = String(rawCommissionValue).includes('(') && String(rawCommissionValue).includes(')');
          const parsedCommission = parseFloat(commissionValue) || 0;
          processed.agentPayout = isNegative ? -parsedCommission : parsedCommission;
          
          console.log('✅ Set commission to:', processed.agentPayout);
        } else {
          processed.agentPayout = 0;
        }

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

      // 🚨 CRITICAL: FILTER OUT ZERO VOLUME TRANSACTIONS 🚨
      const totalVolume = (processed.volume || 0) + (processed.debitVolume || 0);
      
      if (totalVolume === 0) {
        console.log('🚫 ZERO VOLUME FILTER: Rejecting row with zero total volume');
        console.log('  Location:', processed.locationName);
        console.log('  Bank Card Volume:', processed.volume);
        console.log('  Debit Card Volume:', processed.debitVolume);
        console.log('  Total Volume:', totalVolume);
        console.log('  🚫 This row will be IGNORED to prevent duplicate location issues');
        return null;
      }

      if (isGreenlight) {
        console.log('🟢🟢🟢 GREENLIGHT FINAL PROCESSING RESULT 🟢🟢🟢');
        console.log('  🟢 Location Name:', processed.locationName);
        console.log('  🟢 Volume:', processed.volume);
        console.log('  🟢 Debit Volume:', processed.debitVolume);
        console.log('  🟢 Total Volume:', totalVolume);
        console.log('  🟢 Commission:', processed.agentPayout);
        console.log('  🟢 Account ID:', processed.accountId);
        console.log('  🟢 Will be processed:', !!processed.locationName && totalVolume > 0);
        console.log('🟢🟢🟢 END GREENLIGHT PROCESSING 🟢🟢🟢');
      }

      if (!processed.locationName || !isValidLocationName(processed.locationName)) {
        console.log('❌ FINAL REJECTION: No valid location name found - ROW WILL BE SKIPPED');
        return null;
      }

      console.log('✅ ROW APPROVED: Valid location name and non-zero volume confirmed for processing');
      console.log(`✅ Total Volume: ${totalVolume} (Bank: ${processed.volume}, Debit: ${processed.debitVolume})`);
      return processed;
    } catch (error) {
      console.error('❌ Error processing row:', error);
      return null;
    }
  };

  // ENHANCED: Location merging with identical names but different account IDs
  const ensureLocationExists = async (locationName: string, accountId?: string): Promise<string | null> => {
    if (!locationName || !isValidLocationName(locationName)) {
      console.log('❌ CRITICAL: Attempting to create location with invalid name:', locationName);
      return null;
    }

    try {
      console.log('🔍 LOCATION MERGER: Checking for existing location with name:', locationName);
      
      // First, check for exact name match (case-insensitive)
      const { data: existingLocations, error: selectError } = await supabase
        .from('locations')
        .select('id, name, account_id')
        .ilike('name', locationName);

      if (selectError && selectError.code !== 'PGRST116') {
        console.error('Error checking existing locations:', selectError);
        return null;
      }

      // Find exact match by name (case-insensitive)
      const exactMatch = existingLocations?.find(loc => 
        loc.name?.toLowerCase().trim() === locationName.toLowerCase().trim()
      );

      if (exactMatch) {
        console.log('✅ FOUND EXISTING LOCATION:', exactMatch.name, 'with ID:', exactMatch.id);
        
        // If we have a new account ID and the existing location doesn't have one, update it
        if (accountId && !exactMatch.account_id) {
          console.log('🔄 UPDATING EXISTING LOCATION with new account ID:', accountId);
          const { error: updateError } = await supabase
            .from('locations')
            .update({ account_id: accountId })
            .eq('id', exactMatch.id);
            
          if (updateError) {
            console.error('Error updating location with account ID:', updateError);
          } else {
            console.log('✅ Successfully updated location with account ID');
          }
        }
        
        // If account IDs are different but names are identical, we still use the existing location
        if (accountId && exactMatch.account_id && exactMatch.account_id !== accountId) {
          console.log('🔀 LOCATION MERGER: Found identical name with different account ID');
          console.log(`   Existing: "${exactMatch.name}" (Account: ${exactMatch.account_id})`);
          console.log(`   New:      "${locationName}" (Account: ${accountId})`);
          console.log('   ✅ MERGING: Using existing location ID to consolidate data');
        }
        
        return exactMatch.id;
      }

      // No exact match found, create new location
      console.log('✅ Creating new location with name:', locationName);
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

      console.log('✅ Successfully created location:', newLocation);
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
    setUploadStatus({ status: 'processing', message: 'Processing file with LOCATION MERGING and ZERO VOLUME FILTERING...', filename: file.name });

    try {
      console.log('=== STARTING LOCATION MERGING UPLOAD ===');
      console.log('Selected month:', selectedMonth);
      console.log('File name:', file.name);
      
      const rawData = await parseFile(file);
      console.log('Parsed data length:', rawData.length);

      if (rawData.length === 0) {
        throw new Error('No data found in file');
      }

      const headers = Object.keys(rawData[0]);
      console.log('All headers found:', headers);
      
      const { processor: detectedProcessor, confidence } = detectProcessor(headers, rawData);
      
      if (!detectedProcessor) {
        throw new Error('Could not detect processor type. Please ensure your file matches one of the supported formats: Maverick, Green Payments, TRNXN, or SignaPay.');
      }

      console.log(`=== PROCESSOR DETECTED: ${detectedProcessor.name} (${(confidence * 100).toFixed(1)}% confidence) ===`);
      
      // Enhanced column mapping
      let locationColumn = null;
      let volumeColumn = null;
      let debitVolumeColumn = null;
      let commissionColumn = null;
      
      if (detectedProcessor.name === 'Green Payments' && detectGreenPaymentsFormat(rawData)) {
        console.log('✅ Using Green Payments __parsed_extra format - skipping column mapping');
        // For Green Payments __parsed_extra format, we don't need to map columns
      } else {
        locationColumn = findColumn(headers, detectedProcessor.locationColumn);
        volumeColumn = findColumn(headers, detectedProcessor.volumeColumn);
        debitVolumeColumn = detectedProcessor.debitVolumeColumn ? findColumn(headers, detectedProcessor.debitVolumeColumn) : null;
        commissionColumn = findColumn(headers, detectedProcessor.commissionColumn);
        
        console.log('=== COLUMN MAPPING ===');
        console.log('- Location column found:', locationColumn);
        console.log('- Volume column found:', volumeColumn);
        console.log('- Debit volume column found:', debitVolumeColumn);
        console.log('- Commission column found:', commissionColumn);

        if (!locationColumn && detectedProcessor.name !== 'Green Payments') {
          throw new Error(`CRITICAL ERROR: No location column found for ${detectedProcessor.name}! Expected columns: ${detectedProcessor.locationColumn.join(', ')}`);
        }

        if (!volumeColumn && detectedProcessor.name !== 'Green Payments') {
          throw new Error(`Could not detect volume column for ${detectedProcessor.name}. Expected columns: ${detectedProcessor.volumeColumn.join(', ')}`);
        }
      }

      // FIXED: Use the first day of the selected month as the transaction date
      const [year, month] = selectedMonth.split('-');
      const transactionDate = `${selectedMonth}-01`;
      const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const endDate = `${selectedMonth}-${lastDayOfMonth}`;

      console.log('=== MONTH ASSIGNMENT FOR UPLOADED DATA ===');
      console.log('Selected month for upload:', selectedMonth);
      console.log('Transaction date being assigned:', transactionDate);
      console.log('Date range for deletion:', `${selectedMonth}-01 to ${endDate}`);

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
      let zeroVolumeRejected = 0;
      let locationsCreated = 0;
      let locationsMerged = 0;
      let merchantHeroAssignments = 0;
      const errors: any[] = [];

      console.log('=== PROCESSING ROWS WITH LOCATION MERGING ===');
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        console.log(`\n--- Processing row ${i + 1} with ${detectedProcessor.name} format ---`);
        
        const processedData = processRow(row, detectedProcessor, locationColumn, volumeColumn, debitVolumeColumn, commissionColumn);

        if (processedData && processedData.locationName) {
          console.log('✅ APPROVED: Valid location name and non-zero volume for row', i + 1, ':', processedData.locationName);

          try {
            let locationId = null;
            if (processedData.locationName) {
              // Check if this will result in a merge
              const { data: existingByName } = await supabase
                .from('locations')
                .select('id, account_id')
                .ilike('name', processedData.locationName);
              
              const exactMatch = existingByName?.find(loc => 
                loc.name?.toLowerCase().trim() === processedData.locationName?.toLowerCase().trim()
              );
              
              const willMerge = exactMatch && processedData.accountId && 
                              exactMatch.account_id && 
                              exactMatch.account_id !== processedData.accountId;
              
              if (willMerge) {
                console.log('🔀 LOCATION WILL BE MERGED: Same name, different account IDs');
                locationsMerged++;
              }
              
              const existingLocationId = await ensureLocationExists(processedData.locationName, processedData.accountId);
              if (existingLocationId) {
                locationId = existingLocationId;
                
                // Check if this was a new location creation
                const { data: locationCheck } = await supabase
                  .from('locations')
                  .select('created_at')
                  .eq('id', existingLocationId)
                  .single();
                
                if (locationCheck && new Date(locationCheck.created_at).getTime() > Date.now() - 5000) {
                  locationsCreated++;
                }

                const bankCardVolume = processedData.volume || 0;
                const debitCardVolume = processedData.debitVolume || 0;
                const totalVolume = bankCardVolume + debitCardVolume;
                
                if (totalVolume > 0 && processedData.agentPayout) {
                  await createMerchantHeroAssignment(existingLocationId, totalVolume, processedData.agentPayout);
                  merchantHeroAssignments++;
                }
              }
            }

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

            const { error } = await supabase
              .from('transactions')
              .insert(transactionData);

            if (error) {
              console.error('❌ Database insertion error for row', i + 1, ':', error);
              errorCount++;
              errors.push({ row: i + 1, error: error.message });
            } else {
              successCount++;
              console.log(`✅ SUCCESS: Row ${i + 1} processed with location name: ${processedData.locationName} for month: ${selectedMonth}`);
            }
          } catch (error) {
            console.error('❌ Error processing row', i + 1, ':', error);
            errorCount++;
            errors.push({ row: i + 1, error: String(error) });
          }
        } else {
          // Check if this was rejected due to zero volume specifically
          const tempProcessedData = processRow(row, detectedProcessor, locationColumn, volumeColumn, debitVolumeColumn, commissionColumn);
          if (tempProcessedData && tempProcessedData.locationName) {
            const totalVolume = (tempProcessedData.volume || 0) + (tempProcessedData.debitVolume || 0);
            if (totalVolume === 0) {
              zeroVolumeRejected++;
              console.log(`🚫 ZERO VOLUME REJECTION: Row ${i + 1} - location "${tempProcessedData.locationName}" has zero volume`);
            }
          } else {
            console.log(`❌ REJECTED: Row ${i + 1} - no valid location name found`);
            errorCount++;
            errors.push({ row: i + 1, error: 'No valid location name found' });
          }
        }
      }

      console.log('=== LOCATION MERGING UPLOAD SUMMARY ===');
      console.log('Processor:', detectedProcessor.name);
      console.log('Selected month for data:', selectedMonth);
      console.log('Transaction date assigned:', transactionDate);
      console.log('Success count:', successCount);
      console.log('Error count:', errorCount);
      console.log('Zero volume rows rejected:', zeroVolumeRejected);
      console.log('Locations created:', locationsCreated);
      console.log('Locations merged (same name, diff account):', locationsMerged);
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

      const monthName = monthOptions.find(m => m.value === selectedMonth)?.label;
      const successMessage = `${detectedProcessor.name} upload completed with location merging! ${successCount} rows processed for ${monthName}. ${zeroVolumeRejected} zero-volume duplicate rows were automatically filtered out. ${locationsMerged} locations with identical names but different account IDs were automatically merged. ${errorCount} rows had other issues. ${locationsCreated > 0 ? ` Created ${locationsCreated} new locations.` : ''} ${merchantHeroAssignments > 0 ? ` Automatically assigned Merchant Hero to ${merchantHeroAssignments} locations with calculated BPS rates.` : ''} All data is tagged for ${monthName}.`;

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
          Smart Processor Detection Upload (Location Merging + Zero Volume Filtering)
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
                    <strong>🔀 LOCATION MERGER:</strong> Identical names with different account IDs automatically merged
                  </p>
                  <p className="text-xs text-red-600 mt-1 font-medium">
                    <strong>🚫 ZERO VOLUME FILTER:</strong> Duplicate rows with $0 volume automatically rejected
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
          <p className="font-medium mb-2 text-green-800">🔀 LOCATION MERGING:</p>
          <ul className="space-y-1 text-green-700">
            <li><strong>📋 Name Matching:</strong> Locations with identical names automatically detected</li>
            <li><strong>🔗 Account Consolidation:</strong> Different account IDs for same location merged</li>
            <li><strong>📊 Data Unification:</strong> All transactions consolidated under single location</li>
            <li><strong>🎯 Greenlight Fix:</strong> Resolves Greenlight & Company appearing with different account IDs</li>
            <li><strong>✅ Smart Merging:</strong> Only merges when location names are 100% identical</li>
            <li><strong>🔄 Account Updates:</strong> Missing account IDs automatically filled when available</li>
          </ul>
        </div>

        <div className="text-xs text-muted-foreground bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="font-medium mb-2 text-red-800">🚫 ZERO VOLUME FILTERING:</p>
          <ul className="space-y-1 text-red-700">
            <li><strong>🔍 Detection:</strong> Automatically identifies duplicate location entries</li>
            <li><strong>💰 Volume Check:</strong> Calculates total volume (Bank Card + Debit Card)</li>
            <li><strong>🚫 Auto-Reject:</strong> Rejects any row where total volume equals $0</li>
            <li><strong>📊 Duplicate Prevention:</strong> Prevents duplicate locations showing as $0 volume</li>
            <li><strong>✅ Clean Data:</strong> Only processes locations with actual transaction volume</li>
            <li><strong>📈 Accurate Reports:</strong> Ensures commission reports show true performance</li>
          </ul>
        </div>

        <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="font-medium mb-2 text-blue-800">✅ Supported Upload Formats:</p>
          <ul className="space-y-1 text-blue-700">
            <li><strong>Maverick:</strong> DBA Name, Sales Amount, Agent Net Revenue</li>
            <li><strong>Green Payments:</strong> Merchant, Sales Amount, Agent Net</li>
            <li><strong>TRNXN:</strong> DBA, Bank Card Volume + Debit Card Volume, Net Commission</li>
            <li><strong>SignaPay:</strong> DBA, Volume, Net</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUpload;
