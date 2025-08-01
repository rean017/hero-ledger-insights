import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Upload, FileText, CheckCircle, AlertCircle, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ParsedRow {
  location: string;
  volume: number;
  agentPayout: number;
  agentName?: string;
}

export const SimpleUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ParsedRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const { toast } = useToast();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.apple.numbers': ['.numbers'],
      'application/x-iwork-numbers-sffnumbers': ['.numbers']
    },
    multiple: false,
    onDrop: (acceptedFiles) => {
      const selectedFile = acceptedFiles[0];
      if (selectedFile) {
        setFile(selectedFile);
        parseFile(selectedFile);
      }
    }
  });

  const parseFile = (file: File) => {
    const fileExtension = file.name.toLowerCase().split('.').pop();
    
    if (fileExtension === 'csv') {
      // Parse CSV with Papa Parse
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          processData(results.data);
        },
        error: (error) => {
          toast({
            title: "Error parsing CSV file",
            description: error.message,
            variant: "destructive"
          });
        }
      });
    } else if (['xlsx', 'xls', 'numbers'].includes(fileExtension || '')) {
      // Parse Excel/Numbers with XLSX
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          // Convert to object format with headers
          if (jsonData.length > 1) {
            const headers = jsonData[0] as string[];
            const rows = jsonData.slice(1).map(row => {
              const obj: any = {};
              headers.forEach((header, index) => {
                obj[header] = (row as any[])[index] || '';
              });
              return obj;
            });
            processData(rows);
          } else {
            toast({
              title: "No data found",
              description: "The file appears to be empty",
              variant: "destructive"
            });
          }
        } catch (error) {
          toast({
            title: "Error parsing file",
            description: "Unable to read this file format. Please try exporting as CSV.",
            variant: "destructive"
          });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast({
        title: "Unsupported file format",
        description: "Please upload a CSV, Excel, or Numbers file",
        variant: "destructive"
      });
    }
  };

  const processData = (rawData: any[]) => {
    const parsedData: ParsedRow[] = [];
    
    rawData.forEach((row: any) => {
      // Look for location column (various possible names)
      const location = row['Location'] || row['location'] || row['DBA'] || row['dba'] || row['Name'] || row['name'] || '';
      
      // Look for volume column (various possible names)
      const volumeValue = row['Volume'] || row['volume'] || row['Amount'] || row['amount'] || row['Total'] || row['total'] || '0';
      const volume = parseFloat(String(volumeValue).replace(/[,$]/g, '')) || 0;
      
      // Look for agent payout column (various possible names)
      const payoutValue = row['Agent Payout'] || row['agent_payout'] || row['Payout'] || row['payout'] || row['Commission'] || row['commission'] || row['Net Agent Payout'] || row['net_agent_payout'] || '0';
      const agentPayout = parseFloat(String(payoutValue).replace(/[,$]/g, '')) || 0;
      
      // Look for agent name column (various possible names)
      const agentName = row['Agent'] || row['agent'] || row['Agent Name'] || row['agent_name'] || row['Rep'] || row['rep'] || row['Representative'] || row['representative'] || '';
      
      if (location && volume > 0) {
        parsedData.push({
          location: location.trim(),
          volume,
          agentPayout,
          agentName: agentName ? agentName.trim() : undefined
        });
      }
    });
    
    setData(parsedData);
    toast({
      title: "File parsed successfully",
      description: `Found ${parsedData.length} valid records`
    });
  };

  const handleUpload = async () => {
    if (data.length === 0) {
      toast({
        title: "No data to upload",
        description: "Please upload a file with valid data first",
        variant: "destructive"
      });
      return;
    }

    if (!selectedDate) {
      toast({
        title: "Date required",
        description: "Please select the month for this data",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    
    try {
      // Create file upload record
      const { data: fileUpload, error: fileUploadError } = await supabase
        .from('file_uploads')
        .insert([{
          filename: file?.name || 'Unknown',
          processor: 'Generic',
          rows_processed: data.length,
          status: 'processing'
        }])
        .select('id')
        .single();

      if (fileUploadError) throw fileUploadError;
      const uploadId = fileUpload.id;

      // Process each row
      for (const row of data) {
        // Find or create location
        const { data: existingLocation } = await supabase
          .from('locations')
          .select('id')
          .eq('name', row.location)
          .maybeSingle();

        let locationId = existingLocation?.id;

        if (!locationId) {
          // Create new location
          const { data: newLocation, error: locationError } = await supabase
            .from('locations')
            .insert([{
              name: row.location,
              account_id: row.location.replace(/\s+/g, '_').toUpperCase()
            }])
            .select('id')
            .single();

          if (locationError) throw locationError;
          locationId = newLocation.id;
        }

        // Create agent assignment if agent name exists and payout > 0
        if (row.agentName && row.agentPayout > 0) {
          // First, ensure the agent exists
          const { data: existingAgent } = await supabase
            .from('agents')
            .select('id')
            .eq('name', row.agentName)
            .maybeSingle();

          if (!existingAgent) {
            // Create new agent
            const { error: agentError } = await supabase
              .from('agents')
              .insert([{
                name: row.agentName,
                is_active: true
              }]);

            if (agentError) throw agentError;
          }

          // Check if assignment already exists
          const { data: existingAssignment } = await supabase
            .from('location_agent_assignments')
            .select('id')
            .eq('location_id', locationId)
            .eq('agent_name', row.agentName)
            .maybeSingle();

          if (!existingAssignment) {
            // Calculate commission rate based on payout vs volume
            const commissionRate = row.volume > 0 ? (row.agentPayout / row.volume) : 0;

            // Create assignment
            const { error: assignmentError } = await supabase
              .from('location_agent_assignments')
              .insert([{
                location_id: locationId,
                agent_name: row.agentName,
                commission_rate: commissionRate,
                is_active: true
              }]);

            if (assignmentError) throw assignmentError;
          }
        }

        // Insert transaction
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert([{
            location_id: locationId,
            volume: row.volume,
            agent_payout: row.agentPayout,
            agent_name: row.agentName,
            transaction_date: format(selectedDate, 'yyyy-MM-dd'),
            processor: 'Generic',
            raw_data: { upload_id: uploadId }
          }]);

        if (transactionError) throw transactionError;
      }

      // Update file upload status
      await supabase
        .from('file_uploads')
        .update({ status: 'completed' })
        .eq('id', uploadId);

      setUploadComplete(true);
      toast({
        title: "Upload successful",
        description: `Uploaded ${data.length} transactions`
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "There was an error uploading the data",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearData = () => {
    setFile(null);
    setData([]);
    setUploadComplete(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Simple File Upload
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div {...getRootProps()} className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
            <input {...getInputProps()} />
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p>Drop the file here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">Drag and drop a CSV/Excel file here</p>
                <p className="text-sm text-muted-foreground">
                  File should contain columns for: Location, Volume, Agent Payout
                </p>
              </div>
            )}
          </div>

          {file && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <FileText className="h-4 w-4" />
              <span className="text-sm">{file.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Data Preview ({data.length} records)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Location</th>
                      <th className="text-right p-2">Volume</th>
                      <th className="text-right p-2">Agent Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 10).map((row, index) => (
                      <tr key={index} className="border-b">
                        <td className="p-2">{row.location}</td>
                        <td className="p-2 text-right">${row.volume.toLocaleString()}</td>
                        <td className="p-2 text-right">${row.agentPayout.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.length > 10 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Showing first 10 records of {data.length}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Transaction Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "MMMM yyyy") : "Select month for this data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleUpload} 
                  disabled={isUploading || uploadComplete}
                  className="flex-1"
                >
                  {isUploading ? (
                    "Uploading..."
                  ) : uploadComplete ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Upload Complete
                    </>
                  ) : (
                    "Upload Data"
                  )}
                </Button>
                <Button variant="outline" onClick={clearData}>
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};