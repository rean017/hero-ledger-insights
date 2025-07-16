
import { useState, useMemo } from 'react';
import { debounce } from 'lodash';

interface SearchableItem {
  id: string;
  name: string;
  account_id?: string;
  agentNames?: string;
  [key: string]: any;
}

export const useOptimizedSearch = <T extends SearchableItem>(
  items: T[],
  searchFields: (keyof T)[] = ['name', 'account_id', 'agentNames']
) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof T>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Debounced search to avoid excessive filtering
  const debouncedSetSearch = useMemo(
    () => debounce((term: string) => setSearchTerm(term), 300),
    []
  );

  // Optimized filtering with memoization
  const filteredAndSortedItems = useMemo(() => {
    if (!items) return [];

    console.log('🔍 OPTIMIZED SEARCH: Filtering', items.length, 'items with term:', searchTerm);

    let filtered = items;

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = items.filter(item =>
        searchFields.some(field => {
          const value = item[field];
          return value && String(value).toLowerCase().includes(searchLower);
        })
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (aVal === bVal) return 0;
      
      const comparison = aVal > bVal ? 1 : -1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    console.log('✅ OPTIMIZED SEARCH: Filtered to', filtered.length, 'items');
    return filtered;
  }, [items, searchTerm, sortField, sortDirection, searchFields]);

  const handleSort = (field: keyof T) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  return {
    searchTerm,
    setSearchTerm: debouncedSetSearch,
    sortField,
    sortDirection,
    handleSort,
    filteredItems: filteredAndSortedItems,
    resultCount: filteredAndSortedItems.length
  };
};
