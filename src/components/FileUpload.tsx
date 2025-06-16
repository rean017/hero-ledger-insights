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

  // ENHANCED: Row processing with INTENSIVE Greenlight debugging for volume issues
  const processRow = (row: any, processorConfig: ProcessorConfig, locationColumn: string | null, volumeColumn: string | null, debitVolumeColumn: string | null, commissionColumn: string | null): ProcessedData | null => {
    try {
      let processed: ProcessedData = { rawData: row, processor: processorConfig.name };

      console.log('\n=== PROCESSING ROW WITH INTENSIVE GREENLIGHT VOLUME DEBUGGING ===');
      console.log('Processor:', processorConfig.name);
      
      // Check if this is a Greenlight row
      const rowString = JSON.stringify(row).toLowerCase();
      const isGreenlight = rowString.includes('greenlight');
      
      if (isGreenlight) {
        console.log('🟢🟢🟢 GREENLIGHT ROW DETECTED! 🟢🟢🟢');
        console.log('🟢 COMPLETE ROW DATA:', JSON.stringify(row, null, 2));
        console.log('🟢 ALL OBJECT KEYS:', Object.keys(row));
        console.log('🟢 ALL OBJECT VALUES:', Object.values(row));
        console.log('🟢 Volume column mapping:', volumeColumn);
        console.log('🟢 Commission column mapping:', commissionColumn);
        console.log('🟢 Location column mapping:', locationColumn);
        
        // Log every single property in the row
        Object.entries(row).forEach(([key, value]) => {
          console.log(`🟢 ROW PROPERTY: "${key}" = "${value}" (type: ${typeof value})`);
        });
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
        
        // INTENSIVE GREENLIGHT VOLUME DEBUGGING
        if (volumeColumn && row[volumeColumn] !== undefined) {
          const rawVolumeValue = row[volumeColumn];
          
          if (isGreenlight) {
            console.log('🟢🟢🟢 GREENLIGHT VOLUME PROCESSING INTENSIVE DEBUG 🟢🟢🟢');
            console.log(`🟢 Volume column name: "${volumeColumn}"`);
            console.log(`🟢 Raw volume value: "${rawVolumeValue}"`);
            console.log(`🟢 Raw volume type: ${typeof rawVolumeValue}`);
            console.log(`🟢 Raw volume is null: ${rawVolumeValue === null}`);
            console.log(`🟢 Raw volume is undefined: ${rawVolumeValue === undefined}`);
            console.log(`🟢 Raw volume stringified: ${JSON.stringify(rawVolumeValue)}`);
          }
          
          // Handle different volume formats
          let volumeValue = String(rawVolumeValue);
          
          if (isGreenlight) {
            console.log(`🟢 Volume after String conversion: "${volumeValue}"`);
          }
          
          // Remove currency symbols, commas, and parentheses
          volumeValue = volumeValue.replace(/[\$,()]/g, '');
          
          if (isGreenlight) {
            console.log(`🟢 Volume after cleaning: "${volumeValue}"`);
          }
          
          // Handle negative values in parentheses format
          const isNegative = String(rawVolumeValue).includes('(') && String(rawVolumeValue).includes(')');
          
          const parsedVolume = parseFloat(volumeValue) || 0;
          processed.volume = isNegative ? -parsedVolume : parsedVolume;
          
          if (isGreenlight) {
            console.log('🟢 GREENLIGHT FINAL VOLUME CALCULATION:');
            console.log('  🟢 Original value:', rawVolumeValue);
            console.log('  🟢 Cleaned value:', volumeValue);
            console.log('  🟢 Parsed float:', parsedVolume);
            console.log('  🟢 Is negative:', isNegative);
            console.log('  🟢 FINAL VOLUME SET TO:', processed.volume);
            
            if (processed.volume === 0) {
              console.log('🟢🚨 WARNING: GREENLIGHT VOLUME IS ZERO! 🚨🟢');
              console.log('🟢 This suggests the volume parsing failed');
              console.log('🟢 Check if the volume column contains the expected data');
            }
          }
          
          console.log('✅ Set volume to:', processed.volume);
        } else {
          processed.volume = 0;
          if (isGreenlight) {
            console.log('🟢🚨 GREENLIGHT CRITICAL: NO VOLUME COLUMN OR VALUE! 🚨🟢');
            console.log('  🟢 Volume column:', volumeColumn);
            console.log('  🟢 Row has this property:', volumeColumn ? (volumeColumn in row) : 'N/A');
            console.log('  🟢 Value in volume column:', volumeColumn ? row[volumeColumn] : 'N/A');
          }
        }
        
        // ENHANCED: Handle debit volume separately for TRNXN with better detection
        if (debitVolumeColumn && row[debitVolumeColumn]) {
          const debitVolumeValue = String(row[debitVolumeColumn]).replace(/[,$]/g, '');
          processed.debitVolume = parseFloat(debitVolumeValue) || 0;
          console.log('✅ Set debit card volume to:', processed.debitVolume);
        } else {
          processed.debitVolume = 0;
          if (processorConfig.name === 'TRNXN') {
            console.log('⚠️ WARNING: TRNXN row has no debit volume - this may be incorrect');
          }
        }
        
        // INTENSIVE GREENLIGHT COMMISSION DEBUGGING
        if (commissionColumn && row[commissionColumn] !== undefined) {
          const rawCommissionValue = row[commissionColumn];
          
          if (isGreenlight) {
            console.log('🟢🟢🟢 GREENLIGHT COMMISSION PROCESSING INTENSIVE DEBUG 🟢🟢🟢');
            console.log(`🟢 Commission column name: "${commissionColumn}"`);
            console.log(`🟢 Raw commission value: "${rawCommissionValue}"`);
            console.log(`🟢 Raw commission type: ${typeof rawCommissionValue}`);
            console.log(`🟢 Raw commission stringified: ${JSON.stringify(rawCommissionValue)}`);
          }
          
          let commissionValue = String(rawCommissionValue);
          commissionValue = commissionValue.replace(/[\$,()]/g, '');
          
          const isNegative = String(rawCommissionValue).includes('(') && String(rawCommissionValue).includes(')');
          const parsedCommission = parseFloat(commissionValue) || 0;
          processed.agentPayout = isNegative ? -parsedCommission : parsedCommission;
          
          if (isGreenlight) {
            console.log('🟢 GREENLIGHT FINAL COMMISSION CALCULATION:');
            console.log('  🟢 Original value:', rawCommissionValue);
            console.log('  🟢 Cleaned value:', commissionValue);
            console.log('  🟢 Parsed float:', parsedCommission);
            console.log('  🟢 Is negative:', isNegative);
            console.log('  🟢 FINAL COMMISSION SET TO:', processed.agentPayout);
          }
          
          console.log('✅ Set commission to:', processed.agentPayout);
        } else {
          processed.agentPayout = 0;
          if (isGreenlight) {
            console.log('🟢🚨 GREENLIGHT CRITICAL: NO COMMISSION COLUMN OR VALUE! 🚨🟢');
            console.log('  🟢 Commission column:', commissionColumn);
            console.log('  🟢 Row has this property:', commissionColumn ? (commissionColumn in row) : 'N/A');
            console.log('  🟢 Value in commission column:', commissionColumn ? row[commissionColumn] : 'N/A');
          }
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
        
        if (isGreenlight && processed.accountId) {
          console.log('🟢 GREENLIGHT ACCOUNT ID FOUND:', processed.accountId);
        }
      }

      if (isGreenlight) {
        console.log('🟢🟢🟢 GREENLIGHT FINAL PROCESSING RESULT 🟢🟢🟢');
        console.log('  🟢 Location Name:', processed.locationName);
        console.log('  🟢 Volume:', processed.volume);
        console.log('  🟢 Commission:', processed.agentPayout);
        console.log('  🟢 Account ID:', processed.accountId);
        console.log('  🟢 Will be processed:', !!processed.locationName);
        console.log('🟢🟢🟢 END GREENLIGHT PROCESSING 🟢🟢🟢');
      }

      if (!processed.locationName || !isValidLocationName(processed.locationName)) {
        console.log('❌ FINAL REJECTION: No valid location name found - ROW WILL BE SKIPPED');
        return null;
      }

      console.log('✅ ROW APPROVED: Valid location name confirmed for processing');
      return processed;
    } catch (error) {
      console.error('❌ Error processing row:', error);
      return null;
    }
  };

  // SIMPLIFIED: Location creation with basic validation
  const ensureLocationExists = async (locationName: string, accountId?: string): Promise<string | null> => {
    if (!locationName || !isValidLocationName(locationName)) {
      console.log('❌ CRITICAL: Attempting to create location with invalid name:', locationName);
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
        console.log('✅ Found existing location with name:', locationName);
        return existingLocation.id;
      }

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
    setUploadStatus({ status: 'processing', message: 'Processing file with INTENSIVE GREENLIGHT VOLUME DEBUGGING...', filename: file.name });

    try {
      console.log('=== STARTING INTENSIVE GREENLIGHT VOLUME DEBUG UPLOAD ===');
      console.log('Selected month:', selectedMonth);
      console.log('File name:', file.name);
      
      const rawData = await parseFile(file);
      console.log('Parsed data length:', rawData.length);
      console.log('Parsed data sample (first 3 rows):', rawData.slice(0, 3));

      // Look for Greenlight rows in the raw data
      const greenlightRows = rawData.filter(row => {
        const rowString = JSON.stringify(row).toLowerCase();
        return rowString.includes('greenlight');
      });
      
      console.log('🟢 GREENLIGHT ROWS FOUND IN FILE:', greenlightRows.length);
      if (greenlightRows.length > 0) {
        console.log('🟢 ALL GREENLIGHT RAW DATA:');
        greenlightRows.forEach((row, index) => {
          console.log(`🟢 Greenlight Row ${index + 1}:`, JSON.stringify(row, null, 2));
        });
      }

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
      
      // Enhanced column mapping with intensive Greenlight debugging
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
        
        console.log('=== COLUMN MAPPING FOR GREENLIGHT DEBUG ===');
        console.log('- Location column found:', locationColumn);
        console.log('- Volume column found:', volumeColumn);
        console.log('- Debit volume column found:', debitVolumeColumn);
        console.log('- Commission column found:', commissionColumn);
        
        if (greenlightRows.length > 0) {
          console.log('🟢 GREENLIGHT COLUMN VALUE SAMPLES:');
          greenlightRows.forEach((row, index) => {
            console.log(`🟢 Greenlight Row ${index + 1} column values:`);
            if (locationColumn) console.log(`  🟢 Location (${locationColumn}):`, row[locationColumn]);
            if (volumeColumn) console.log(`  🟢 Volume (${volumeColumn}):`, row[volumeColumn]);
            if (commissionColumn) console.log(`  🟢 Commission (${commissionColumn}):`, row[commissionColumn]);
          });
        }

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
      let locationsCreated = 0;
      let merchantHeroAssignments = 0;
      let greenlightProcessed = 0;
      const errors: any[] = [];

      console.log('=== PROCESSING ROWS WITH INTENSIVE GREENLIGHT VOLUME DEBUGGING ===');
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const rowString = JSON.stringify(row).toLowerCase();
        const isGreenlight = rowString.includes('greenlight');
        
        if (isGreenlight) {
          console.log(`\n🟢🟢🟢 PROCESSING GREENLIGHT ROW ${i + 1} of ${rawData.length} 🟢🟢🟢`);
        } else {
          console.log(`\n--- Processing row ${i + 1} with ${detectedProcessor.name} format ---`);
        }
        
        const processedData = processRow(row, detectedProcessor, locationColumn, volumeColumn, debitVolumeColumn, commissionColumn);

        if (processedData && processedData.locationName) {
          if (isGreenlight) {
            console.log('🟢🟢🟢 GREENLIGHT ROW APPROVED FOR PROCESSING:', processedData.locationName);
            console.log('🟢 FINAL GREENLIGHT DATA TO PROCESS:', JSON.stringify(processedData, null, 2));
            greenlightProcessed++;
          } else {
            console.log('✅ APPROVED: Valid location name for row', i + 1, ':', processedData.locationName);
          }

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

                const bankCardVolume = processedData.volume || 0;
                const debitCardVolume = processedData.debitVolume || 0;
                const totalVolume = bankCardVolume + debitCardVolume;
                
                if (isGreenlight) {
                  console.log('🟢🟢🟢 GREENLIGHT VOLUME CALCULATION FOR DB:');
                  console.log(`  🟢 Bank Card Volume: ${bankCardVolume}`);
                  console.log(`  🟢 Debit Card Volume: ${debitCardVolume}`);
                  console.log(`  🟢 TOTAL VOLUME: ${totalVolume}`);
                  console.log(`  🟢 Commission: ${processedData.agentPayout}`);
                }
                
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

            if (isGreenlight) {
              console.log('🟢🟢🟢 GREENLIGHT TRANSACTION DATA TO INSERT INTO DATABASE:');
              console.log(JSON.stringify(transactionData, null, 2));
            }

            const { error } = await supabase
              .from('transactions')
              .insert(transactionData);

            if (error) {
              console.error('❌ Database insertion error for row', i + 1, ':', error);
              if (isGreenlight) {
                console.log('🟢🚨 GREENLIGHT DATABASE ERROR:', error);
              }
              errorCount++;
              errors.push({ row: i + 1, error: error.message });
            } else {
              successCount++;
              if (isGreenlight) {
                console.log(`🟢🟢🟢 GREENLIGHT SUCCESS: Row ${i + 1} processed successfully! 🟢🟢🟢`);
                console.log(`🟢 Greenlight transaction inserted with volume: ${transactionData.volume}`);
              } else {
                console.log(`✅ SUCCESS: Row ${i + 1} processed with location name: ${processedData.locationName} for month: ${selectedMonth}`);
              }
            }
          } catch (error) {
            console.error('❌ Error processing row', i + 1, ':', error);
            if (isGreenlight) {
              console.log('🟢🚨 GREENLIGHT PROCESSING ERROR:', error);
            }
            errorCount++;
            errors.push({ row: i + 1, error: String(error) });
          }
        } else {
          if (isGreenlight) {
            console.log(`🟢🚨 GREENLIGHT ROW ${i + 1} REJECTED - no valid location name found`);
          } else {
            console.log(`❌ REJECTED: Row ${i + 1} - no valid location name found`);
          }
          errorCount++;
          errors.push({ row: i + 1, error: 'No valid location name found' });
        }
      }

      console.log('=== INTENSIVE GREENLIGHT VOLUME DEBUG UPLOAD SUMMARY ===');
      console.log('Processor:', detectedProcessor.name);
      console.log('Greenlight rows found in file:', greenlightRows.length);
      console.log('Greenlight rows processed successfully:', greenlightProcessed);
      console.log('Selected month for data:', selectedMonth);
      console.log('Transaction date assigned:', transactionDate);
      console.log('Success count:', successCount);
      console.log('Error count:', errorCount);
      console.log('Locations created:', locationsCreated);
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
      const successMessage = `${detectedProcessor.name} upload completed with intensive Greenlight volume debugging! Found ${greenlightRows.length} Greenlight rows in file, processed ${greenlightProcessed} successfully. Total: ${successCount} rows processed for ${monthName}. ${errorCount} rows had issues. ${locationsCreated > 0 ? ` Created ${locationsCreated} new locations.` : ''} ${merchantHeroAssignments > 0 ? ` Automatically assigned Merchant Hero to ${merchantHeroAssignments} locations with calculated BPS rates.` : ''} All data is tagged for ${monthName}.`;

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
          Smart Processor Detection Upload (Intensive Greenlight Volume Debugging)
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
                    <strong>🟢 INTENSIVE VOLUME DEBUG:</strong> Enhanced Greenlight & Company volume tracking
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
          <p className="font-medium mb-2 text-green-800">🟢 INTENSIVE GREENLIGHT VOLUME DEBUGGING:</p>
          <ul className="space-y-1 text-green-700">
            <li><strong>🔍 Detection:</strong> Finds all Greenlight & Company rows in uploaded file</li>
            <li><strong>📊 Volume Analysis:</strong> Intensive logging of volume column parsing and calculation</li>
            <li><strong>💰 Commission Analysis:</strong> Detailed commission processing with step-by-step logging</li>
            <li><strong>🗂️ Raw Data Inspection:</strong> Logs complete row data for Greenlight entries</li>
            <li><strong>📋 Column Mapping:</strong> Shows exact column names and values being processed</li>
            <li><strong>🎯 Zero Volume Detection:</strong> Alerts if Greenlight volume calculates to zero</li>
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
