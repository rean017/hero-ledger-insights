import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
}

const FileUpload = () => {
  const [selectedProcessor, setSelectedProcessor] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    status: 'idle' | 'processing' | 'success' | 'error';
    message: string;
    filename?: string;
    rowsProcessed?: number;
  }>({ status: 'idle', message: '' });
  const { toast } = useToast();

  const processors = [
    { value: "TRNXN", label: "TRNXN" },
    { value: "Maverick", label: "Maverick" },
    { value: "SignaPay", label: "SignaPay" },
    { value: "Gren Payments", label: "Gren Payments" }
  ];

  const processRow = (row: any, processor: string): ProcessedData | null => {
    try {
      let processed: ProcessedData = { rawData: row };

      switch (processor) {
        case 'TRNXN':
          processed.volume = parseFloat(row['Volume'] || row['volume'] || row['Total Volume'] || 0);
          processed.debitVolume = parseFloat(row['Debit Volume'] || row['debit_volume'] || row['Debit'] || 0);
          processed.agentPayout = parseFloat(row['Agent Payout'] || row['agent_payout'] || row['Payout'] || 0);
          processed.agentName = row['Agent'] || row['agent'] || row['Agent Name'] || row['agent_name'];
          processed.accountId = row['Account ID'] || row['account_id'] || row['Account'] || row['MID'];
          processed.locationName = row['Location'] || row['location'] || row['Business Name'] || row['DBA'] || row['Merchant Name'];
          processed.transactionDate = row['Date'] || row['date'] || row['Transaction Date'];
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

        case 'Gren Payments':
          processed.volume = parseFloat(row['Processing Volume'] || row['Volume'] || row['Sales Volume'] || 0);
          processed.debitVolume = parseFloat(row['Debit Volume'] || row['Refunds'] || 0);
          processed.agentPayout = parseFloat(row['Agent Revenue'] || row['Commission'] || 0);
          processed.agentName = row['Agent'] || row['Partner'] || row['Sales Partner'];
          processed.accountId = row['Merchant ID'] || row['Account'] || row['Customer ID'];
          processed.locationName = row['Business Name'] || row['DBA'] || row['Merchant Name'] || row['Location'];
          processed.transactionDate = row['Date'] || row['Processing Date'] || row['Trans Date'];
          break;

        default:
          return null;
      }

      return processed;
    } catch (error) {
      console.error('Error processing row:', error);
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
    if (!file || !selectedProcessor) {
      toast({
        title: "Error",
        description: "Please select a processor and a file",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    setUploadStatus({ status: 'processing', message: 'Processing file...', filename: file.name });

    try {
      // Create file upload record
      const { data: uploadRecord, error: uploadError } = await supabase
        .from('file_uploads')
        .insert({
          filename: file.name,
          processor: selectedProcessor,
          status: 'processing'
        })
        .select()
        .single();

      if (uploadError) throw uploadError;

      // Parse the file
      const rawData = await parseFile(file);
      console.log('Parsed data:', rawData);

      let successCount = 0;
      let errorCount = 0;
      const errors: any[] = [];

      // Process each row
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        const processedData = processRow(row, selectedProcessor);

        if (processedData) {
          try {
            // Ensure location exists if we have location data
            let locationId = null;
            if (processedData.locationName) {
              locationId = await ensureLocationExists(processedData.locationName, processedData.accountId);
            }

            const { error } = await supabase
              .from('transactions')
              .insert({
                processor: selectedProcessor,
                volume: processedData.volume,
                debit_volume: processedData.debitVolume,
                agent_payout: processedData.agentPayout,
                agent_name: processedData.agentName,
                account_id: processedData.accountId,
                transaction_date: processedData.transactionDate,
                raw_data: processedData.rawData
              });

            if (error) {
              errorCount++;
              errors.push({ row: i + 1, error: error.message });
            } else {
              successCount++;
            }
          } catch (error) {
            errorCount++;
            errors.push({ row: i + 1, error: String(error) });
          }
        } else {
          errorCount++;
          errors.push({ row: i + 1, error: 'Failed to process row data' });
        }
      }

      // Update file upload record
      await supabase
        .from('file_uploads')
        .update({
          status: errorCount === rawData.length ? 'failed' : 'completed',
          rows_processed: successCount,
          errors: errors.length > 0 ? errors : null
        })
        .eq('id', uploadRecord.id);

      setUploadStatus({
        status: errorCount === rawData.length ? 'error' : 'success',
        message: `Processed ${successCount} rows successfully. ${errorCount} errors.`,
        filename: file.name,
        rowsProcessed: successCount
      });

      toast({
        title: "Upload Complete",
        description: `Successfully processed ${successCount} rows from ${file.name}`,
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
          <label className="text-sm font-medium">Select Processor</label>
          <Select value={selectedProcessor} onValueChange={setSelectedProcessor}>
            <SelectTrigger>
              <SelectValue placeholder="Choose processor..." />
            </SelectTrigger>
            <SelectContent>
              {processors.map((processor) => (
                <SelectItem key={processor.value} value={processor.value}>
                  {processor.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
              </div>
              <input
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading || !selectedProcessor}
              />
            </label>
          </div>
        </div>

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
          <p className="font-medium mb-1">Supported columns for each processor:</p>
          <ul className="space-y-1">
            <li><strong>TRNXN:</strong> Volume, Debit Volume, Agent Payout, Agent, Account ID, Location/Business Name, Date</li>
            <li><strong>Maverick:</strong> Total Amount, Debit Amount, Commission, Sales Rep, Merchant ID, Business Name/DBA, Settlement Date</li>
            <li><strong>SignaPay:</strong> Gross Sales, Returns, Residual, Agent Name, DBA, Business Name, Process Date</li>
            <li><strong>Gren Payments:</strong> Processing Volume, Debit Volume, Agent Revenue, Agent, Merchant ID, Business Name, Date</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default FileUpload;
