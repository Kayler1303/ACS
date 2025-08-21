'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface Snapshot {
  id: string;
  date: string;
  createdAt: string;
}

interface SnapshotSelectorProps {
  propertyId: string;
  selectedSnapshotId: string | null;
  onSnapshotChange: (snapshotId: string) => void;
}

export default function SnapshotSelector({ 
  propertyId, 
  selectedSnapshotId, 
  onSnapshotChange 
}: SnapshotSelectorProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSnapshots = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/properties/${propertyId}/snapshots`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch snapshots');
        }
        
        const data = await response.json();
        setSnapshots(data);
        
        // If no snapshot is selected and we have snapshots, select the most recent one
        if (!selectedSnapshotId && data.length > 0) {
          onSnapshotChange(data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load snapshots');
      } finally {
        setLoading(false);
      }
    };

    if (propertyId) {
      fetchSnapshots();
    }
  }, [propertyId, selectedSnapshotId, onSnapshotChange]);

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">Loading snapshots...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-red-600">Error: {error}</span>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">No data snapshots available</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      <label htmlFor="snapshot-select" className="text-sm font-medium text-gray-700">
        Data Snapshot Date:
      </label>
      <select
        id="snapshot-select"
        value={selectedSnapshotId || ''}
        onChange={(e) => onSnapshotChange(e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
      >
        {snapshots.map((snapshot) => (
          <option key={snapshot.id} value={snapshot.id}>
            {format(new Date(snapshot.date), 'MMM dd, yyyy')} 
            {' '}
            (uploaded {format(new Date(snapshot.createdAt), 'MMM dd, yyyy')})
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-500">
        {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} available
      </span>
    </div>
  );
} 