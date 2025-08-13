'use client';

import { useState, useEffect, useCallback } from 'react';
// Define PermissionLevel locally since it might not be available from @prisma/client yet
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

interface PropertyShare {
  id: string;
  permission: PermissionLevel;
  createdAt: string;
  user: User;
  sharedBy: User;
}

interface PropertyShareManagerProps {
  propertyId: string;
  propertyName: string;
  isOwner: boolean;
}

export default function PropertyShareManager({ propertyId, propertyName, isOwner }: PropertyShareManagerProps) {
  const [shares, setShares] = useState<PropertyShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [permission, setPermission] = useState<PermissionLevel>(PermissionLevel.READ_ONLY);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchShares = useCallback(async () => {
    if (!isOwner) return; // Don't fetch if not owner
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/properties/${propertyId}/shares`);
      if (response.ok) {
        const data = await response.json();
        setShares(data.shares);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to fetch shares');
      }
    } catch (err) {
      setError('Failed to fetch shares');
    } finally {
      setLoading(false);
    }
  }, [propertyId, isOwner]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  // Only owners can manage shares
  if (!isOwner) {
    return null;
  }



  const handleAddShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/properties/${propertyId}/shares`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail: userEmail.trim(),
          permission,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setShares([...shares, data.share]);
        setUserEmail('');
        setPermission(PermissionLevel.READ_ONLY);
        setShowAddForm(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to share property');
      }
    } catch (err) {
      setError('Failed to share property');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePermission = async (shareId: string, newPermission: PermissionLevel) => {
    try {
      const response = await fetch(`/api/properties/${propertyId}/shares/${shareId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ permission: newPermission }),
      });

      if (response.ok) {
        const data = await response.json();
        setShares(shares.map(share => 
          share.id === shareId ? { ...share, permission: newPermission } : share
        ));
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update permission');
      }
    } catch (err) {
      setError('Failed to update permission');
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    if (!confirm('Are you sure you want to remove this user\'s access?')) {
      return;
    }

    try {
      const response = await fetch(`/api/properties/${propertyId}/shares/${shareId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setShares(shares.filter(share => share.id !== shareId));
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to remove access');
      }
    } catch (err) {
      setError('Failed to remove access');
    }
  };

  const getPermissionLabel = (permission: PermissionLevel) => {
    switch (permission) {
      case PermissionLevel.READ_ONLY:
        return { text: 'Read Only', description: 'Can view property data only' };
      case PermissionLevel.CONFIGURE:
        return { text: 'Configure', description: 'Can change settings and configurations' };
      case PermissionLevel.EDIT:
        return { text: 'Edit', description: 'Can upload files and edit all data' };
      default:
        return { text: 'Unknown', description: '' };
    }
  };

  const getPermissionColor = (permission: PermissionLevel) => {
    switch (permission) {
      case PermissionLevel.READ_ONLY:
        return 'bg-gray-100 text-gray-800';
      case PermissionLevel.CONFIGURE:
        return 'bg-blue-100 text-blue-800';
      case PermissionLevel.EDIT:
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Property Sharing</h2>
          <p className="text-sm text-gray-600">Manage who has access to {propertyName}</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showAddForm ? 'Cancel' : 'Share Property'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddShare} className="mb-6 p-4 bg-gray-50 rounded-lg border">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Share Property</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="userEmail" className="block text-sm font-medium text-gray-700 mb-1">
                User Email
              </label>
              <input
                type="email"
                id="userEmail"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="Enter user's email address"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label htmlFor="permission" className="block text-sm font-medium text-gray-700 mb-1">
                Permission Level
              </label>
              <select
                id="permission"
                value={permission}
                onChange={(e) => setPermission(e.target.value as PermissionLevel)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={PermissionLevel.READ_ONLY}>Read Only</option>
                <option value={PermissionLevel.CONFIGURE}>Configure</option>
                <option value={PermissionLevel.EDIT}>Edit</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {getPermissionLabel(permission).description}
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setUserEmail('');
                setPermission(PermissionLevel.READ_ONLY);
                setError(null);
              }}
              className="px-4 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !userEmail.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isSubmitting ? 'Sharing...' : 'Share Property'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="text-gray-600 mt-2">Loading shares...</p>
        </div>
      ) : shares.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>This property hasn't been shared with anyone yet.</p>
          <p className="text-sm">Click "Share Property" to give others access.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shares.map((share) => (
            <div key={share.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {share.user.name || share.user.email}
                    </p>
                    {share.user.name && (
                      <p className="text-sm text-gray-600">{share.user.email}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPermissionColor(share.permission)}`}>
                    {getPermissionLabel(share.permission).text}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Shared on {new Date(share.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={share.permission}
                  onChange={(e) => handleUpdatePermission(share.id, e.target.value as PermissionLevel)}
                  className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value={PermissionLevel.READ_ONLY}>Read Only</option>
                  <option value={PermissionLevel.CONFIGURE}>Configure</option>
                  <option value={PermissionLevel.EDIT}>Edit</option>
                </select>
                
                <button
                  onClick={() => handleRemoveShare(share.id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 