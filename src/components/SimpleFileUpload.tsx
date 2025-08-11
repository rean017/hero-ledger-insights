import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Calendar as CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface ParsedRow {
  locationName: string;
  volume: number;
  agentPayout: number;
  agentName: string;
}

export const SimpleFileUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ParsedRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<Date | undefined>(undefined);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const { toast } = useToast();

  const onDrop = (acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      parseFile(uploadedFile);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.iwork.numbers': ['.numbers']
    },
    multiple: false
  });

  const parseFile = (file: File) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results.data);
        },
        error: (error) => {
          console.error('CSV parsing error:', error);
          toast({ 
            title: "Parse Error", 
            description: "Failed to parse CSV file", 
            variant: "destructive" 
          });
        }
      });
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls' || fileExtension === 'numbers') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          
          if (jsonData.length < 2) {
            throw new Error('File must contain headers and at least one data row');
          }
          
          const headers = jsonData[0] as string[];
          const rows = jsonData.slice(1) as any[][];
          
          const parsedData = rows.map(row => {
            const obj: any = {};
            headers.forEach((header, index) => {
              obj[header] = row[index];
            });
            return obj;
          }).filter(row => Object.values(row).some(val => val !== undefined && val !== ''));
          
          processData(parsedData);
        } catch (error) {
          console.error('Excel parsing error:', error);
          toast({ 
            title: "Parse Error", 
            description: "Failed to parse Excel file", 
            variant: "destructive" 
          });
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const processData = (rawData: any[]) => {
    const processed: ParsedRow[] = rawData.map((row, index) => {
      // Find location column (various possible names)
      const location = row['Location'] || row['location'] || row['Location Name'] || row['location_name'] || row['Store'] || row['store'];
      
      // Find volume column
      const volume = row['Volume'] || row['volume'] || row['Sales Volume'] || row['sales_volume'] || row['Total Volume'] || row['total_volume'];
      
      // Find agent payout column
      const agentPayout = row['Agent Payout'] || row['agent_payout'] || row['Net Agent Payout'] || row['net_agent_payout'] || row['Commission'] || row['commission'];
      
      // Find agent name column
      const agentName = row['Agent Name'] || row['agent_name'] || row['Agent'] || row['agent'] || row['Rep'] || row['rep'];

      if (!location || !volume || !agentPayout || !agentName) {
        console.warn(`Row ${index + 1} is missing required fields:`, row);
        return null;
      }

      return {
        locationName: String(location).trim(),
        volume: Number(String(volume).replace(/[$,]/g, '')) || 0,
        agentPayout: Number(String(agentPayout).replace(/[$,]/g, '')) || 0,
        agentName: String(agentName).trim()
      };
    }).filter((row): row is ParsedRow => row !== null);

    console.log('Processed data:', processed);
    setData(processed);
    
    if (processed.length === 0) {
      toast({ 
        title: "No Data Found", 
        description: "Please ensure your file has columns: Location, Volume, Agent Payout, Agent Name", 
        variant: "destructive" 
      });
    } else {
      toast({ 
        title: "File Parsed Successfully", 
        description: `Found ${processed.length} valid records` 
      });
    }
  };

  const handleUpload = async () => {
    if (!data.length || !selectedMonth) {
      toast({ 
        title: "Missing Data", 
        description: "Please upload a file and select a month", 
        variant: "destructive" 
      });
      return;
    }

    setIsUploading(true);
    try {
      const monthKey = format(selectedMonth, 'yyyy-MM-01');
      
      // Delete existing data for this month
      const { error: deleteError } = await supabase
        .from('monthly_data')
        .delete()
        .eq('month', monthKey);
      
      if (deleteError) {
        console.error('Error deleting existing data:', deleteError);
      }

      // Insert new data
      const insertData = data.map(row => ({
        month: monthKey,
        location_name: row.locationName,
        volume: row.volume,
        agent_payout: row.agentPayout,
        agent_name: row.agentName
      }));

      const { error: insertError } = await supabase
        .from('monthly_data')
        .insert(insertData);

      if (insertError) {
        throw insertError;
      }

      // Create/update agents automatically
      const uniqueAgents = [...new Set(data.map(row => row.agentName))];
      for (const agentName of uniqueAgents) {
        const { error: agentError } = await supabase
          .from('agents')
          .upsert({ 
            name: agentName 
          }, { 
            onConflict: 'name'
          });
        
        if (agentError) {
          console.warn('Error upserting agent:', agentError);
        }
      }

      setUploadComplete(true);
      toast({ 
        title: "Upload Successful", 
        description: `Uploaded ${data.length} records for ${format(selectedMonth, 'MMMM yyyy')}` 
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({ 
        title: "Upload Failed", 
        description: "Please try again", 
        variant: "destructive" 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearData = () => {
    setFile(null);
    setData([]);
    setSelectedMonth(undefined);
    setUploadComplete(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Monthly Commission Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!file && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                {isDragActive ? 'Drop the file here' : 'Upload CSV or Excel file'}
              </p>
              <p className="text-sm text-muted-foreground">
                Required columns: Location, Volume, Agent Payout, Agent Name
              </p>
            </div>
          )}

          {file && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {data.length} records found
                    </p>
                  </div>
                </div>
                <Badge variant="outline">{file.type}</Badge>
              </div>

              {data.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Data Preview (first 5 rows):</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Location</th>
                          <th className="p-2 text-left">Volume</th>
                          <th className="p-2 text-left">Agent Payout</th>
                          <th className="p-2 text-left">Agent Name</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.slice(0, 5).map((row, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-2">{row.locationName}</td>
                            <td className="p-2">${row.volume.toLocaleString()}</td>
                            <td className="p-2">${row.agentPayout.toLocaleString()}</td>
                            <td className="p-2">{row.agentName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Select Month
                </label>
                <Calendar
                  mode="single"
                  selected={selectedMonth}
                  onSelect={setSelectedMonth}
                  className="rounded-md border w-fit"
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleUpload} 
                  disabled={!selectedMonth || isUploading}
                  className="flex-1"
                >
                  {isUploading ? 'Uploading...' : 'Upload Data'}
                </Button>
                <Button variant="outline" onClick={clearData}>
                  Clear
                </Button>
              </div>

              {uploadComplete && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800 font-medium">
                    ✅ Upload completed successfully!
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};