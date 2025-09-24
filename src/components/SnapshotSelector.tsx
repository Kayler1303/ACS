'use client';

import { useState, useEffect } from 'react';
import SnapshotDeleteDialog from './SnapshotDeleteDialog';

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
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    snapshot: Snapshot | null;
  }>({
    isOpen: false,
    snapshot: null
  });
  const [showManagement, setShowManagement] = useState(false);

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
      day: 'numeric'
    });
  };

  const handleDeleteSnapshot = async (snapshot: Snapshot) => {
    try {
      const response = await fetch(`/api/properties/${propertyId}/snapshots/${snapshot.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete snapshot');
      }

      // Success - refresh snapshots
      await fetchSnapshots();
      setDeleteDialog({ isOpen: false, snapshot: null });
      
      // If deleted snapshot was selected, select another one
      if (selectedSnapshotId === snapshot.id && snapshots.length > 1) {
        const remainingSnapshots = snapshots.filter(s => s.id !== snapshot.id);
        const activeSnapshot = remainingSnapshots.find(s => s.isActive) || remainingSnapshots[0];
        onSnapshotChange(activeSnapshot.id, activeSnapshot);
      }
    } catch (error) {
      console.error('Error deleting snapshot:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete snapshot');
    }
  };

  const handleMakeActive = async (snapshot: Snapshot) => {
    try {
      const response = await fetch(`/api/properties/${propertyId}/snapshots/${snapshot.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'make_active' })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to activate snapshot');
      }

      // Success - refresh snapshots
      await fetchSnapshots();
      onSnapshotChange(snapshot.id, snapshot);
    } catch (error) {
      console.error('Error activating snapshot:', error);
      alert(error instanceof Error ? error.message : 'Failed to activate snapshot');
    }
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
    <div className="space-y-3">
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
              {snapshot.filename && !snapshot.filename.startsWith('Upload ') && !snapshot.filename.includes('Compliance Upload') && ` - ${snapshot.filename}`}
              {snapshot.isActive && ' (Current)'}
            </option>
          ))}
        </select>
        <div className="text-xs text-gray-500">
          {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} available
        </div>
        {snapshots.length > 1 && (
          <button
            onClick={() => setShowManagement(!showManagement)}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {showManagement ? 'Hide' : 'Manage'}
          </button>
        )}
      </div>

      {/* Snapshot Management */}
      {showManagement && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Manage Snapshots</h4>
          <div className="space-y-2">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className={`flex items-center justify-between p-3 rounded border ${
                  snapshot.isActive
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    snapshot.isActive ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatDate(snapshot.uploadDate)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {snapshot.filename && !snapshot.filename.startsWith('Upload ') && !snapshot.filename.includes('Compliance Upload') ? snapshot.filename : 'Data Snapshot'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {!snapshot.isActive && (
                    <button
                      onClick={() => handleMakeActive(snapshot)}
                      className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Make Active
                    </button>
                  )}
                  
                  {!snapshot.isActive && (
                    <button
                      onClick={() => setDeleteDialog({ isOpen: true, snapshot })}
                      className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  )}
                  
                  {snapshot.isActive && (
                    <span className="text-xs text-green-600 font-medium">Active</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <SnapshotDeleteDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, snapshot: null })}
        onConfirm={() => deleteDialog.snapshot && handleDeleteSnapshot(deleteDialog.snapshot)}
        snapshot={deleteDialog.snapshot!}
        isAdmin={false}
      />
    </div>
  );
} 