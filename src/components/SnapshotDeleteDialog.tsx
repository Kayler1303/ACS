'use client';

import { useState } from 'react';

interface SnapshotDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (force?: boolean) => void;
  snapshot: {
    id: string;
    filename?: string;
    uploadDate: string;
    isActive: boolean;
  };
  isAdmin?: boolean;
  requiresForce?: boolean;
  errorDetails?: {
    isActive: boolean;
    rentRollCount: number;
  };
}

export default function SnapshotDeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  snapshot,
  isAdmin = false,
  requiresForce = false,
  errorDetails
}: SnapshotDeleteDialogProps) {
  const [forceDelete, setForceDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm(forceDelete);
    } finally {
      setIsDeleting(false);
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

  const getWarningMessage = () => {
    if (errorDetails) {
      if (errorDetails.isActive) {
        return "This is the active snapshot. Deleting it may cause the property to lose its current data state.";
      }
      if (errorDetails.rentRollCount > 0) {
        return `This snapshot has ${errorDetails.rentRollCount} associated rent roll(s). Deleting it will permanently remove this historical data.`;
      }
    }
    return null;
  };

  const warningMessage = getWarningMessage();
  const showForceOption = isAdmin && requiresForce;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center mb-4">
            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
          </div>
          
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Delete Snapshot
            </h3>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium text-gray-900">
                {snapshot.filename || 'Unnamed File'}
              </div>
              <div className="text-xs text-gray-500">
                {formatDate(snapshot.uploadDate)}
              </div>
              {snapshot.isActive && (
                <div className="text-xs text-green-600 font-medium mt-1">
                  Active Snapshot
                </div>
              )}
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Are you sure you want to delete this snapshot? This action cannot be undone.
            </p>

            {warningMessage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex">
                  <svg className="h-5 w-5 text-red-400 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div className="text-sm text-red-700">
                    <strong>Warning:</strong> {warningMessage}
                  </div>
                </div>
              </div>
            )}

            {showForceOption && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <label className="flex items-start">
                  <input
                    type="checkbox"
                    checked={forceDelete}
                    onChange={(e) => setForceDelete(e.target.checked)}
                    className="mt-1 mr-2 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  />
                  <div className="text-sm">
                    <div className="font-medium text-yellow-800">Force Delete (Admin Only)</div>
                    <div className="text-yellow-700">
                      I understand this will cause data loss and want to proceed anyway.
                    </div>
                  </div>
                </label>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isDeleting || (showForceOption && !forceDelete)}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Deleting...
                </div>
              ) : (
                'Delete Snapshot'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
