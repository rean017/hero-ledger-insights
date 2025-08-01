import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ParsedRow {
  location: string;
  volume: number;
  agentPayout: number;
}

export const SimpleUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ParsedRow[]>([]);
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
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const parsedData: ParsedRow[] = [];
        
        results.data.forEach((row: any) => {
          // Look for location column (various possible names)
          const location = row['Location'] || row['location'] || row['DBA'] || row['dba'] || row['Name'] || row['name'] || '';
          
          // Look for volume column (various possible names)
          const volumeValue = row['Volume'] || row['volume'] || row['Amount'] || row['amount'] || row['Total'] || row['total'] || '0';
          const volume = parseFloat(String(volumeValue).replace(/[,$]/g, '')) || 0;
          
          // Look for agent payout column (various possible names)
          const payoutValue = row['Agent Payout'] || row['agent_payout'] || row['Payout'] || row['payout'] || row['Commission'] || row['commission'] || '0';
          const agentPayout = parseFloat(String(payoutValue).replace(/[,$]/g, '')) || 0;
          
          if (location && volume > 0) {
            parsedData.push({
              location: location.trim(),
              volume,
              agentPayout
            });
          }
        });
        
        setData(parsedData);
        toast({
          title: "File parsed successfully",
          description: `Found ${parsedData.length} valid records`
        });
      },
      error: (error) => {
        toast({
          title: "Error parsing file",
          description: error.message,
          variant: "destructive"
        });
      }
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

    setIsUploading(true);
    
    try {
      // Process each row
      for (const row of data) {
        // Find or create location
        const { data: existingLocation } = await supabase
          .from('locations')
          .select('id')
          .eq('name', row.location)
          .single();

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

        // Insert transaction
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert([{
            location_id: locationId,
            volume: row.volume,
            agent_payout: row.agentPayout,
            transaction_date: new Date().toISOString().split('T')[0],
            processor: 'SIMPLE'
          }]);

        if (transactionError) throw transactionError;
      }

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