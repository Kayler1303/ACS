'use client';

import { useState, useEffect, useCallback } from 'react';

// Define PermissionLevel locally to avoid import issues
enum PermissionLevel {
  READ_ONLY = 'READ_ONLY',
  CONFIGURE = 'CONFIGURE',
  EDIT = 'EDIT'
}

interface User {
  id: string;
  name: string | null;
  email: string;
}

interface Share {
  id: string;
  permission: PermissionLevel;
  createdAt: string;
  user: User;
  sharedBy: {
    name: string | null;
    email: string;
  };
}

interface PropertyShareManagerProps {
  propertyId: string;
  propertyName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function PropertyShareManager({ 
  propertyId, 
  propertyName, 
  isOpen, 
  onClose 
}: PropertyShareManagerProps) {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // New share form state
  const [newShareEmail, setNewShareEmail] = useState('');
  const [newSharePermission, setNewSharePermission] = useState<PermissionLevel>(PermissionLevel.READ_ONLY);
  const [isCreating, setIsCreating] = useState(false);

  const loadShares = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/properties/${propertyId}/shares`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load shares');
      }
      
      setShares(data.shares);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  // Load existing shares when modal opens
  useEffect(() => {
    if (isOpen) {
      loadShares();
    }
  }, [isOpen, propertyId, loadShares]);

  const createShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch(`/api/properties/${propertyId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: newShareEmail,
          permission: newSharePermission
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to share property');
      }
      
      setSuccess(data.message);
      setNewShareEmail('');
      setNewSharePermission(PermissionLevel.READ_ONLY);
      loadShares(); // Reload the shares list
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share property');
    } finally {
      setIsCreating(false);
    }
  };

  const updateShare = async (shareId: string, permission: PermissionLevel) => {
    try {
      const response = await fetch(`/api/properties/${propertyId}/shares/${shareId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update share');
      }
      
      setSuccess(data.message);
      loadShares(); // Reload the shares list
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update share');
    }
  };

  const deleteShare = async (shareId: string) => {
    if (!confirm('Are you sure you want to remove this person\'s access to the property?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/properties/${propertyId}/shares/${shareId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove share');
      }
      
      setSuccess(data.message);
      loadShares(); // Reload the shares list
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove share');
    }
  };

  const getPermissionLabel = (permission: PermissionLevel) => {
    switch (permission) {
      case PermissionLevel.READ_ONLY:
        return 'Read Only';
      case PermissionLevel.CONFIGURE:
        return 'Configure';
      case PermissionLevel.EDIT:
        return 'Edit';
      default:
        return permission;
    }
  };

  const getPermissionDescription = (permission: PermissionLevel) => {
    switch (permission) {
      case PermissionLevel.READ_ONLY:
        return 'Can view property data only';
      case PermissionLevel.CONFIGURE:
        return 'Can change settings like compliance options and analysis settings';
      case PermissionLevel.EDIT:
        return 'Can upload files, edit data, and perform all actions except sharing';
      default:
        return '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">
              Share Property: {propertyName}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
              {success}
            </div>
          )}

          {/* New Share Form */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Share with New User</h3>
            <form onSubmit={createShare} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  User Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={newShareEmail}
                  onChange={(e) => setNewShareEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label htmlFor="permission" className="block text-sm font-medium text-gray-700 mb-1">
                  Permission Level
                </label>
                <select
                  id="permission"
                  value={newSharePermission}
                  onChange={(e) => setNewSharePermission(e.target.value as PermissionLevel)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={PermissionLevel.READ_ONLY}>Read Only</option>
                  <option value={PermissionLevel.CONFIGURE}>Configure</option>
                  <option value={PermissionLevel.EDIT}>Edit</option>
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  {getPermissionDescription(newSharePermission)}
                </p>
              </div>
              
              <button
                type="submit"
                disabled={isCreating}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Sharing...' : 'Share Property'}
              </button>
            </form>
          </div>

          {/* Existing Shares */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Shares</h3>
            
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading shares...</p>
              </div>
            ) : shares.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                This property hasn't been shared with anyone yet.
              </p>
            ) : (
              <div className="space-y-3">
                {shares.map((share) => (
                  <div key={share.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          {share.user.name || share.user.email}
                        </span>
                        {share.user.name && (
                          <span className="text-gray-500 text-sm">({share.user.email})</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        Shared on {new Date(share.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <select
                        value={share.permission}
                        onChange={(e) => updateShare(share.id, e.target.value as PermissionLevel)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value={PermissionLevel.READ_ONLY}>Read Only</option>
                        <option value={PermissionLevel.CONFIGURE}>Configure</option>
                        <option value={PermissionLevel.EDIT}>Edit</option>
                      </select>
                      
                      <button
                        onClick={() => deleteShare(share.id)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            <h4 className="font-medium mb-2">Permission Levels:</h4>
            <ul className="space-y-1">
              <li><strong>Read Only:</strong> Can view property data only</li>
              <li><strong>Configure:</strong> Can change settings like compliance options and analysis settings</li>
              <li><strong>Edit:</strong> Can upload files, edit data, and perform all actions except sharing</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 