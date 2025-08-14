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
import { normalizeMonthInput } from '@/utils/month';
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
  location: [
    'dba', 'location', 'locationname', 'business', 'store', 'storename', 
    'account', 'accountname', 'customer', 'client', 'merchant'
  ],
  volume: [
    'volume', 'totalvolume', 'monthlyvolume', 'tpv', 'grossvolume', 
    'sales', 'salesvolume', 'processingvolume', 'netvolume'
  ],
  agent_net: [
    'agentnet', 'agentnetpayout', 'agentnetrevenue', 'netpayout', 'netrevenue', 
    'residuals', 'commission', 'agentpayout'
  ]
};

const normalizeHeader = (header: string): string => {
  return String(header || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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


const findHeaderRow = (rows: any[][]): { headerIndex: number; headers: string[] } => {
  const scoreRow = (row: any[]): number => {
    const normalizedCells = row.map(cell => normalizeHeader(String(cell || '')));
    let score = 0;
    
    const hasMatch = (aliases: string[]) => 
      normalizedCells.some(cell => aliases.includes(cell));
    
    if (hasMatch(COLUMN_ALIASES.location)) score++;
    if (hasMatch(COLUMN_ALIASES.volume)) score++;
    if (hasMatch(COLUMN_ALIASES.agent_net)) score++;
    
    return score;
  };

  const searchRows = rows.slice(0, Math.min(10, rows.length));
  let bestScore = -1;
  let bestIndex = 0;

  searchRows.forEach((row, index) => {
    const score = scoreRow(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return {
    headerIndex: bestIndex,
    headers: rows[bestIndex]?.map(h => String(h || '').trim()) || []
  };
};

const autoMapHeaders = (headers: string[]): ColumnMapping => {
  const mapping: ColumnMapping = { location: null, volume: null, agentNet: null };
  
  const findColumn = (aliases: string[]): string | null => {
    const headerIndex = headers.findIndex(header => 
      aliases.includes(normalizeHeader(header))
    );
    return headerIndex >= 0 ? headers[headerIndex] : null;
  };

  mapping.location = findColumn(COLUMN_ALIASES.location);
  mapping.volume = findColumn(COLUMN_ALIASES.volume);
  mapping.agentNet = findColumn(COLUMN_ALIASES.agent_net);

  return mapping;
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
        header: false, // We'll handle headers ourselves
        skipEmptyLines: true,
        complete: (results) => {
          processFileData(results.data as string[][], file.name);
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
          
          // Find first sheet with data
          const sheetName = workbook.SheetNames.find(name => {
            const sheet = workbook.Sheets[name];
            const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { 
              header: 1, 
              raw: false, 
              blankrows: false 
            });
            return rows.flat().some(v => String(v || '').trim().length > 0);
          }) || workbook.SheetNames[0];
          
          if (!sheetName) {
            setError('No data found in any worksheet');
            return;
          }
          
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { 
            header: 1, 
            raw: false, 
            blankrows: false 
          });
          
          processFileData(rows, file.name);
        } catch (error) {
          setError('Failed to parse Excel file');
          console.error('Excel parsing error:', error);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const processFileData = (rows: string[][], filename: string) => {
    if (!rows.length) {
      setError('No data found in file');
      return;
    }

    // Find header row and extract headers
    const { headerIndex, headers } = findHeaderRow(rows);
    
    // Get data rows (everything after header row)
    const dataRows = rows.slice(headerIndex + 1).filter(row => 
      row.some(cell => String(cell || '').trim().length > 0)
    );
    
    if (!headers.length) {
      setError('No valid headers found in file');
      return;
    }

    if (!dataRows.length) {
      setError('No data rows found after headers');
      return;
    }

    setRawData(dataRows);
    setHeaders(headers);
    
    // Auto-map headers
    const mapping = autoMapHeaders(headers);
    setColumnMapping(mapping);
    
    // Check if we have all required mappings
    const mappedCount = Object.values(mapping).filter(v => v !== null).length;
    
    if (mappedCount >= 2) {
      setError(null);
      generatePreview(dataRows, mapping, headers);
    } else {
      setError('We loaded your file. Map the three columns below. We\'ll remember your choices for next time.');
    }
  };

  const generatePreview = (data: string[][], mapping: ColumnMapping, headers: string[]) => {
    if (!mapping.location || !mapping.volume || !mapping.agentNet) {
      setParsedData([]);
      return;
    }
    
    const locationIndex = headers.indexOf(mapping.location);
    const volumeIndex = headers.indexOf(mapping.volume);
    const agentNetIndex = headers.indexOf(mapping.agentNet);
    
    if (locationIndex === -1 || volumeIndex === -1 || agentNetIndex === -1) {
      setParsedData([]);
      return;
    }
    
    const parsed = data.map(row => ({
      location: String(row[locationIndex] || '').trim(),
      volume: parseNumber(row[volumeIndex]),
      agentNet: parseNumber(row[agentNetIndex])
    })).filter(row => row.location.length > 0);
    
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
    generatePreview(rawData, newMapping, headers);
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
    
    let month: string;
    try {
      month = normalizeMonthInput(monthInput);
    } catch (e: any) {
      setError(e.message);
      toast({
        title: "Invalid Month",
        description: e.message,
        variant: "destructive"
      });
      return;
    }
    
    setIsUploading(true);
    setError(null);
    
    try {
      // Build payload rows with canonical keys the API expects
      const rows = parsedData.map(row => ({
        location: row.location,
        volume: row.volume,
        agent_net: row.agentNet
      }));

      // Robust fetch with JSON fallback
      const postJSON = async (url: string, payload: any) => {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        let body: any = null;
        const text = await resp.text(); // read once
        try { 
          body = text ? JSON.parse(text) : null; // try JSON
        } catch { 
          body = { error: text || 'Unknown error' }; // fallback
        }

        return { ok: resp.ok, status: resp.status, body };
      };

      const { ok, body } = await postJSON('/api/uploads/master', {
        month,
        rows,
        filename: file?.name || 'upload'
      });
      
      if (!ok) {
        const errorMessage = body?.error || 'Upload failed';
        setError(errorMessage);
        toast({
          title: "Upload Failed",
          description: errorMessage,
          variant: "destructive"
        });
        return;
      }

      setUploadComplete(true);
      toast({
        title: "Upload Successful",
        description: `Imported ${body.inserted} • New locations ${body.new_locations} • Zero-volume ${body.zero_count}`
      });
      
    } catch (error: any) {
      console.error('Upload error:', error);
      const errorMessage = error.message || 'Upload failed. Please try again.';
      setError(errorMessage);
      toast({
        title: "Upload Failed",
        description: errorMessage,
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
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-blue-600" />
                  <p className="text-sm text-blue-800">{error}</p>
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

              {parsedData.length > 0 && !error && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <h4 className="font-medium">✓ {parsedData.length} records found</h4>
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
                  type="text"
                  inputMode="numeric"
                  placeholder="YYYY-MM"
                  value={monthInput}
                  onChange={(e) => setMonthInput(e.target.value)}
                  className="w-48"
                />
              </div>

              <form noValidate>
                <div className="flex gap-2">
                  <Button 
                    type="button"
                    onClick={handleUpload} 
                    disabled={!parsedData.length || !monthInput || isUploading || !!error}
                    className="flex-1"
                  >
                    {isUploading ? 'Uploading...' : 'Upload Data'}
                  </Button>
                  <Button type="button" variant="outline" onClick={clearData}>
                    Clear
                  </Button>
                </div>
              </form>

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