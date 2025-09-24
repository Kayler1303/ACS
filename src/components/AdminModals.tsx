import React, { useState } from 'react';
import SnapshotDeleteDialog from './SnapshotDeleteDialog';

export interface User {
  id: string;
  email: string;
  name?: string;
  company: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  emailVerified?: string;
  stats?: {
    totalProperties: number;
    ownedProperties: number;
    sharedProperties: number;
    pendingRequests: number;
    totalRequests: number;
  };
}

// User Properties Modal Component
export function UserPropertiesModal({
  user,
  properties,
  onClose,
  onPropertyClick
}: {
  user: User;
  properties: any[];
  onClose: () => void;
  onPropertyClick: (property: any) => void;
}) {
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white max-h-[80vh] overflow-y-auto">
        <div className="mt-3">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Properties for {user.name || user.email}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-2xl font-bold text-blue-600">{properties.length}</div>
              <div className="text-sm text-blue-700">Total Properties</div>
            </div>
            <div className="bg-green-50 p-3 rounded">
              <div className="text-2xl font-bold text-green-600">
                {properties.filter(p => p.ownership === 'owned').length}
              </div>
              <div className="text-sm text-green-700">Owned</div>
            </div>
            <div className="bg-purple-50 p-3 rounded">
              <div className="text-2xl font-bold text-purple-600">
                {properties.filter(p => p.ownership === 'shared').length}
              </div>
              <div className="text-sm text-purple-700">Shared</div>
            </div>
            <div className="bg-orange-50 p-3 rounded">
              <div className="text-2xl font-bold text-orange-600">
                {properties.reduce((sum, p) => sum + (p._count?.RentRollSnapshot || 0), 0)}
              </div>
              <div className="text-sm text-orange-700">Total Snapshots</div>
            </div>
          </div>

          <div className="space-y-3">
            {properties.map((property) => (
              <div
                key={property.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onPropertyClick(property)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className="text-sm font-medium text-gray-900">{property.name}</h4>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        property.ownership === 'owned' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {property.ownership === 'owned' ? 'Owned' : 'Shared'}
                      </span>
                      {property.isOwned === false && property.sharedBy && (
                        <span className="text-xs text-gray-500">
                          via {property.sharedBy.name || property.sharedBy.company}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {property.address}, {property.county}, {property.state}
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>{property._count?.Unit || 0} units</span>
                      <span>{property._count?.RentRollSnapshot || 0} snapshots</span>
                      <span>{property._count?.OverrideRequest || 0} requests</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-900">
                      {property._count?.RentRollSnapshot || 0} snapshots
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Last updated: {new Date(property.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Recent Snapshots Preview */}
                {property.recentSnapshots && property.recentSnapshots.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <h5 className="text-xs font-medium text-gray-700 mb-2">Recent Snapshots:</h5>
                    <div className="flex flex-wrap gap-1">
                      {property.recentSnapshots.map((snapshot: any) => (
                        <span
                          key={snapshot.id}
                          className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                            snapshot.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {new Date(snapshot.uploadDate).toLocaleDateString()}
                          {snapshot.filename && ` - ${snapshot.filename}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Property Snapshots Modal Component
export function PropertySnapshotsModal({
  propertyData,
  onClose
}: {
  propertyData: any;
  onClose: () => void;
}) {
  const { property, snapshots, statistics } = propertyData;
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    snapshot: any;
    requiresForce: boolean;
    errorDetails?: any;
  }>({
    isOpen: false,
    snapshot: null,
    requiresForce: false
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleDeleteSnapshot = async (snapshot: any) => {
    try {
      const response = await fetch(`/api/admin/properties/${property.id}/snapshots/${snapshot.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.requiresForce) {
          setDeleteDialog({
            isOpen: true,
            snapshot,
            requiresForce: true,
            errorDetails: data.details
          });
          return;
        }
        throw new Error(data.error || 'Failed to delete snapshot');
      }

      // Success - refresh the page or close modal
      alert('Snapshot deleted successfully');
      window.location.reload();
    } catch (error) {
      console.error('Error deleting snapshot:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete snapshot');
    }
  };

  const handleMakeActive = async (snapshot: any) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/properties/${property.id}/snapshots/${snapshot.id}`, {
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

      // Success - refresh the page
      alert('Snapshot activated successfully');
      window.location.reload();
    } catch (error) {
      console.error('Error activating snapshot:', error);
      alert(error instanceof Error ? error.message : 'Failed to activate snapshot');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDelete = async (force = false) => {
    try {
      setIsLoading(true);
      const url = `/api/admin/properties/${property.id}/snapshots/${deleteDialog.snapshot.id}${force ? '?force=true' : ''}`;
      
      const response = await fetch(url, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete snapshot');
      }

      setDeleteDialog({ isOpen: false, snapshot: null, requiresForce: false });
      alert('Snapshot deleted successfully');
      window.location.reload();
    } catch (error) {
      console.error('Error deleting snapshot:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete snapshot');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-5xl shadow-lg rounded-md bg-white max-h-[85vh] overflow-y-auto">
        <div className="mt-3">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                Snapshots for {property.name}
              </h3>
              <p className="text-sm text-gray-600">
                {property.address}, {property.county}, {property.state}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Statistics */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded">
              <div className="text-2xl font-bold text-blue-600">{statistics.totalSnapshots}</div>
              <div className="text-sm text-blue-700">Total Snapshots</div>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <div className="text-2xl font-bold text-green-600">
                {statistics.activeSnapshot ? 'Active' : 'None'}
              </div>
              <div className="text-sm text-green-700">Active Snapshot</div>
            </div>
            <div className="bg-purple-50 p-4 rounded">
              <div className="text-2xl font-bold text-purple-600">{statistics.recentUploads}</div>
              <div className="text-sm text-purple-700">Recent Uploads (30d)</div>
            </div>
            <div className="bg-orange-50 p-4 rounded">
              <div className="text-2xl font-bold text-orange-600">
                {Object.keys(statistics.fileTypes).length}
              </div>
              <div className="text-sm text-orange-700">File Types</div>
            </div>
          </div>

          {/* Snapshots by Month */}
          <div className="space-y-6">
            {statistics.snapshotsByMonth.map((monthData: any) => (
              <div key={monthData.month} className="border border-gray-200 rounded-lg p-4">
                <h4 className="text-md font-medium text-gray-900 mb-3">
                  {new Date(monthData.month + '-01').toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long'
                  })}
                  <span className="ml-2 text-sm text-gray-500">
                    ({monthData.count} snapshots)
                  </span>
                </h4>

                <div className="space-y-2">
                  {monthData.snapshots.map((snapshot: any) => (
                    <div
                      key={snapshot.id}
                      className={`flex items-center justify-between p-3 rounded border ${
                        snapshot.isActive
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          snapshot.isActive ? 'bg-green-500' : 'bg-gray-400'
                        }`} />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {snapshot.filename || 'Unnamed File'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(snapshot.uploadDate).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-right mr-4">
                          <div className="text-sm text-gray-900">
                            {snapshot._count?.rentRolls || 0} rent rolls
                          </div>
                          {snapshot.isActive && (
                            <div className="text-xs text-green-600 font-medium">Active</div>
                          )}
                        </div>
                        
                        {!snapshot.isActive && (
                          <button
                            onClick={() => handleMakeActive(snapshot)}
                            disabled={isLoading}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                          >
                            Make Active
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleDeleteSnapshot(snapshot)}
                          disabled={isLoading}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Delete Dialog */}
      <SnapshotDeleteDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, snapshot: null, requiresForce: false })}
        onConfirm={handleConfirmDelete}
        snapshot={deleteDialog.snapshot}
        isAdmin={true}
        requiresForce={deleteDialog.requiresForce}
        errorDetails={deleteDialog.errorDetails}
      />
    </div>
  );
}

// Delete User Confirmation Modal Component
export function DeleteUserModal({
  user,
  onClose,
  onConfirm,
  loading
}: {
  user: User;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center mb-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Delete User</h3>
              <p className="text-sm text-gray-500">This action cannot be undone</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-sm text-gray-700 mb-3">
              Are you sure you want to delete <strong>{user.name || user.email}</strong>?
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <div className="text-sm text-yellow-800">
                <strong>Warning:</strong> This will permanently delete:
              </div>
              <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside space-y-1">
                <li>User account and profile</li>
                <li>All override requests created by this user</li>
                <li>All admin messages sent/received</li>
                <li>Property sharing permissions</li>
              </ul>
              <div className="mt-2 text-sm text-yellow-800">
                <strong>Note:</strong> If the user owns properties, they must be reassigned or deleted first.
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Deleting...' : 'Delete User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
