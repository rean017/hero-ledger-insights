
import Papa from 'papaparse';

export interface FileAnalysisResult {
  suggestedProcessor: string;
  detectedDateRange: { from: Date; to: Date } | null;
  rowCount: number;
  columns: string[];
  sampleData: any[];
  confidence: number;
}

export const analyzeFile = (file: File): Promise<FileAnalysisResult> => {
  return new Promise((resolve) => {
    console.log('🔍 FILE ANALYZER: Starting analysis of', file.name);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      preview: 100, // Analyze first 100 rows for performance
      complete: (results) => {
        const data = results.data as any[];
        const columns = Object.keys(data[0] || {});
        
        console.log('📊 FILE ANALYZER: Parsed columns:', columns);
        
        // Detect processor based on column patterns
        const suggestedProcessor = detectProcessor(columns);
        
        // Detect date range from data
        const detectedDateRange = detectDateRange(data);
        
        // Calculate confidence based on column matches
        const confidence = calculateConfidence(columns, suggestedProcessor);
        
        const result: FileAnalysisResult = {
          suggestedProcessor,
          detectedDateRange,
          rowCount: data.length,
          columns,
          sampleData: data.slice(0, 5), // First 5 rows
          confidence
        };
        
        console.log('✅ FILE ANALYZER: Analysis complete:', result);
        resolve(result);
      },
      error: (error) => {
        console.error('❌ FILE ANALYZER: Parse error:', error);
        resolve({
          suggestedProcessor: 'Unknown',
          detectedDateRange: null,
          rowCount: 0,
          columns: [],
          sampleData: [],
          confidence: 0
        });
      }
    });
  });
};

const detectProcessor = (columns: string[]): string => {
  const columnStr = columns.join(' ').toLowerCase();
  
  // TRNXN patterns
  if (columnStr.includes('dba name') && columnStr.includes('bank card volume')) {
    return 'TRNXN';
  }
  
  // NUVEI patterns
  if (columnStr.includes('merchant name') && columnStr.includes('total volume')) {
    return 'NUVEI';
  }
  
  // PAYSAFE patterns
  if (columnStr.includes('account name') && columnStr.includes('processing volume')) {
    return 'PAYSAFE';
  }
  
  // Generic patterns
  if (columnStr.includes('volume') || columnStr.includes('sales')) {
    return 'Generic';
  }
  
  return 'Unknown';
};

const detectDateRange = (data: any[]): { from: Date; to: Date } | null => {
  const dateFields = ['date', 'transaction_date', 'processing_date', 'settlement_date'];
  
  let dates: Date[] = [];
  
  // Look for date fields in the data
  for (const row of data) {
    for (const field of dateFields) {
      const value = row[field];
      if (value) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          dates.push(date);
        }
      }
    }
    
    // Also check all fields for date-like values
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          dates.push(date);
        }
      }
    }
  }
  
  if (dates.length === 0) return null;
  
  // Sort dates and get range
  dates.sort((a, b) => a.getTime() - b.getTime());
  
  return {
    from: dates[0],
    to: dates[dates.length - 1]
  };
};

const calculateConfidence = (columns: string[], processor: string): number => {
  const columnStr = columns.join(' ').toLowerCase();
  
  const processorPatterns = {
    'TRNXN': ['dba name', 'bank card volume', 'debit card volume', 'agent payout'],
    'NUVEI': ['merchant name', 'total volume', 'commission'],
    'PAYSAFE': ['account name', 'processing volume', 'fees'],
    'Generic': ['volume', 'amount', 'total']
  };
  
  const patterns = processorPatterns[processor as keyof typeof processorPatterns] || [];
  const matches = patterns.filter(pattern => columnStr.includes(pattern)).length;
  
  return Math.min(100, (matches / patterns.length) * 100);
};
