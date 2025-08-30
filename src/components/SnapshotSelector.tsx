'use client';

import { useState, useEffect } from 'react';

interface Snapshot {
  id: string;
  uploadDate: string;
  filename?: string;
  isActive: boolean;
  hudIncomeLimits: any;
  hudDataYear: number | null;
}

interface SnapshotSelectorProps {
  propertyId: string;
  selectedSnapshotId?: string;
  onSnapshotChange: (snapshotId: string, snapshotData?: Snapshot) => void;
}

export default function SnapshotSelector({ 
  propertyId, 
  selectedSnapshotId, 
  onSnapshotChange 
}: SnapshotSelectorProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSnapshots();
  }, [propertyId]);

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/properties/${propertyId}/snapshots`);
      
      if (response.ok) {
        const data = await response.json();
        setSnapshots(data.snapshots || []);
        
        // Auto-select the active snapshot if none selected
        if (!selectedSnapshotId && data.snapshots?.length > 0) {
          const activeSnapshot = data.snapshots.find((s: Snapshot) => s.isActive) || data.snapshots[0];
          onSnapshotChange(activeSnapshot.id, activeSnapshot);
        }
      } else {
        console.error('Failed to fetch snapshots');
      }
    } catch (error) {
      console.error('Error fetching snapshots:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-sm text-gray-600">Loading snapshots...</span>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        No data snapshots available
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      <label htmlFor="snapshot-selector" className="text-sm font-medium text-gray-700">
        Data Snapshot:
      </label>
      <select
        id="snapshot-selector"
        value={selectedSnapshotId || ''}
        onChange={(e) => {
          const selectedSnapshot = snapshots.find(s => s.id === e.target.value);
          onSnapshotChange(e.target.value, selectedSnapshot);
        }}
        className="block w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      >
        {snapshots.map((snapshot) => (
          <option key={snapshot.id} value={snapshot.id}>
            {formatDate(snapshot.uploadDate)}
            {snapshot.filename && ` - ${snapshot.filename}`}
            {snapshot.isActive && ' (Current)'}
          </option>
        ))}
      </select>
      <div className="text-xs text-gray-500">
        {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} available
      </div>
    </div>
  );
} 