import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface ParsedData {
  location: string;
  volume: number;
  agentNet: number;
}

interface ColumnMapping {
  location: string | null;
  volume: string | null;
  agentNet: string | null;
}

const COLUMN_ALIASES = {
  location: ['dba', 'location', 'locationname', 'merchant', 'business', 'store', 'accountname'],
  volume: ['volume', 'totalvolume', 'monthlyvolume', 'tpv', 'grossvolume'],
  agentNet: ['agentnetpayout', 'netpayout', 'agentpayout', 'net', 'residuals']
};

const normalizeHeader = (header: string): string => {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

const parseNumber = (value: any): number => {
  if (!value || value === '') return 0;
  
  let str = String(value).trim();
  
  // Handle parentheses as negative
  const isNegative = str.startsWith('(') && str.endsWith(')');
  if (isNegative) {
    str = str.slice(1, -1);
  }
  
  // Remove currency symbols and formatting
  str = str.replace(/[$,\s]/g, '');
  
  const num = parseFloat(str) || 0;
  return isNegative ? -num : num;
};

const normalizeMonth = (monthInput: string): string | null => {
  if (!monthInput) return null;
  
  // Handle formats like 2025/6, 2025-6, 2025-06, etc.
  const cleaned = monthInput.replace(/[\/\-\s]/g, '-');
  const parts = cleaned.split('-');
  
  if (parts.length !== 2) return null;
  
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  
  // Return as YYYY-MM-01
  return `${year}-${month.toString().padStart(2, '0')}-01`;
};

export const EnhancedFileUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    location: null,
    volume: null,
    agentNet: null
  });
  const [monthInput, setMonthInput] = useState('');
  const [parsedData, setParsedData] = useState<ParsedData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { toast } = useToast();

  const onDrop = (acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setError(null);
      setUploadComplete(false);
      parseFile(uploadedFile);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
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
          processFileData(results.data, Object.keys(results.data[0] || {}));
        },
        error: (error) => {
          setError('Failed to parse CSV file');
          console.error('CSV parsing error:', error);
        }
      });
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Auto-pick first non-empty worksheet
          let selectedSheet = null;
          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            if (jsonData.length > 0) {
              selectedSheet = worksheet;
              break;
            }
          }
          
          if (!selectedSheet) {
            setError('No data found in any worksheet');
            return;
          }
          
          const jsonData = XLSX.utils.sheet_to_json(selectedSheet);
          const fileHeaders = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
          
          processFileData(jsonData, fileHeaders);
        } catch (error) {
          setError('Failed to parse Excel file');
          console.error('Excel parsing error:', error);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const processFileData = (data: any[], fileHeaders: string[]) => {
    // Filter out empty rows
    const filteredData = data.filter(row => 
      Object.values(row).some(value => value !== null && value !== undefined && String(value).trim() !== '')
    );
    
    setRawData(filteredData);
    setHeaders(fileHeaders);
    
    // Auto-map headers
    const mapping: ColumnMapping = { location: null, volume: null, agentNet: null };
    
    fileHeaders.forEach(header => {
      const normalized = normalizeHeader(header);
      
      Object.entries(COLUMN_ALIASES).forEach(([field, aliases]) => {
        if (aliases.includes(normalized)) {
          mapping[field as keyof ColumnMapping] = header;
        }
      });
    });
    
    setColumnMapping(mapping);
    
    if (!mapping.location || !mapping.volume || !mapping.agentNet) {
      setError("We found a file but couldn't map required headers. Map them below.");
    } else {
      setError(null);
      generatePreview(filteredData, mapping);
    }
  };

  const generatePreview = (data: any[], mapping: ColumnMapping) => {
    if (!mapping.location || !mapping.volume || !mapping.agentNet) {
      setParsedData([]);
      return;
    }
    
    const parsed = data.map(row => ({
      location: String(row[mapping.location!] || '').trim(),
      volume: parseNumber(row[mapping.volume!]),
      agentNet: parseNumber(row[mapping.agentNet!])
    })).filter(row => row.location); // Only include rows with a location
    
    setParsedData(parsed);
    
    if (parsed.length === 0) {
      setError("0 rows after mapping. Make sure your file has columns for Location, Volume, Agent Net Payout.");
    } else {
      setError(null);
    }
  };

  const handleMappingChange = (field: keyof ColumnMapping, header: string | null) => {
    const newMapping = { ...columnMapping, [field]: header };
    setColumnMapping(newMapping);
    generatePreview(rawData, newMapping);
  };

  const handleUpload = async () => {
    if (!parsedData.length) {
      toast({
        title: "No Data",
        description: "Please upload and map a file with data",
        variant: "destructive"
      });
      return;
    }
    
    const normalizedMonth = normalizeMonth(monthInput);
    if (!normalizedMonth) {
      setError("Enter a month like 2025-06.");
      return;
    }
    
    setIsUploading(true);
    setError(null);
    
    try {
      // Create upload audit
      const { data: auditData, error: auditError } = await supabase
        .from('upload_audits')
        .insert({
          original_filename: file!.name,
          row_count: parsedData.length,
          month: normalizedMonth
        })
        .select()
        .single();
      
      if (auditError) throw auditError;
      
      // Process each row
      for (const row of parsedData) {
        if (!row.location.trim()) continue;
        
        // Upsert location by case-insensitive name
        const { data: locationData, error: locationError } = await supabase
          .from('locations')
          .select('id')
          .ilike('name', row.location.trim())
          .maybeSingle();
        
        let locationId;
        
        if (locationData) {
          locationId = locationData.id;
        } else {
          // Create new location
          const { data: newLocation, error: createError } = await supabase
            .from('locations')
            .insert({ name: row.location.trim() })
            .select('id')
            .single();
          
          if (createError) throw createError;
          locationId = newLocation.id;
        }
        
        // Insert/update facts
        const { error: factsError } = await supabase
          .from('facts')
          .upsert({
            month: normalizedMonth,
            location_id: locationId,
            total_volume: row.volume,
            mh_net_payout: row.agentNet,
            upload_id: auditData.id
          }, {
            onConflict: 'month,location_id'
          });
        
        if (factsError) throw factsError;
      }
      
      setUploadComplete(true);
      toast({
        title: "Upload Successful",
        description: `Uploaded ${parsedData.length} records for ${monthInput}`
      });
      
    } catch (error) {
      console.error('Upload error:', error);
      setError('Upload failed. Please try again.');
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
    setHeaders([]);
    setRawData([]);
    setColumnMapping({ location: null, volume: null, agentNet: null });
    setMonthInput('');
    setParsedData([]);
    setUploadComplete(false);
    setError(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Commission Data
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            File must contain: DBA/Location, Volume, Agent Net Payout.
          </p>
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
                3 columns required: Location, Volume, Agent Net Payout
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
                      {parsedData.length} records found
                    </p>
                  </div>
                </div>
                <Badge variant="outline">{file.type}</Badge>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {headers.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-medium">Column Mapping</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Location/DBA</Label>
                      <Select 
                        value={columnMapping.location || undefined} 
                        onValueChange={(value) => handleMappingChange('location', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          {headers.map(header => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Volume</Label>
                      <Select 
                        value={columnMapping.volume || undefined} 
                        onValueChange={(value) => handleMappingChange('volume', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          {headers.map(header => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Agent Net Payout</Label>
                      <Select 
                        value={columnMapping.agentNet || undefined} 
                        onValueChange={(value) => handleMappingChange('agentNet', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          {headers.map(header => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {parsedData.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <h4 className="font-medium">{parsedData.length} records found</h4>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Location</TableHead>
                          <TableHead>Volume</TableHead>
                          <TableHead>Agent Net Payout</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.slice(0, 5).map((row, index) => (
                          <TableRow key={index}>
                            <TableCell>{row.location}</TableCell>
                            <TableCell>{formatCurrency(row.volume)}</TableCell>
                            <TableCell>{formatCurrency(row.agentNet)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {parsedData.length > 5 && (
                    <p className="text-sm text-muted-foreground">
                      Showing first 5 of {parsedData.length} records
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Month (YYYY-MM)</Label>
                <Input
                  placeholder="2025-06 or 2025/6"
                  value={monthInput}
                  onChange={(e) => setMonthInput(e.target.value)}
                  className="w-48"
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleUpload} 
                  disabled={!parsedData.length || !monthInput || isUploading || !!error}
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