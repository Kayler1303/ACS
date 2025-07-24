'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, Fragment, useCallback } from 'react';
import Link from 'next/link';
import IncomeVerificationDocumentUploadForm from '@/components/IncomeVerificationDocumentUploadForm';
import IncomeVerificationUploadDialog from '@/components/IncomeVerificationUploadDialog';
import VerificationFinalizationDialog from '@/components/VerificationFinalizationDialog';
import CreateLeaseDialog from '@/components/CreateLeaseDialog';
import AddResidentDialog from '@/components/AddResidentDialog';
import RenewalDialog from '@/components/RenewalDialog';
import InitialAddResidentDialog from '@/components/InitialAddResidentDialog';
import { format } from 'date-fns';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// --- NEW Data Structures ---

interface IncomeDocument {
  id: string;
  documentType: string;
  documentDate: Date;
  uploadDate: Date;
  status: string;
  taxYear?: number;
  employeeName?: string;
  employerName?: string;
  box1_wages?: number;
  box3_ss_wages?: number;
  box5_med_wages?: number;
  residentId?: string; // Add residentId to the interface
}

interface IncomeVerification {
  id: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  finalizedAt?: string | null;
  calculatedVerifiedIncome: number | null;
  incomeDocuments: IncomeDocument[];
  // Add new lease-period fields
  reason?: string;
  verificationPeriodStart?: string;
  verificationPeriodEnd?: string;
  dueDate?: string;
  reminderSentAt?: string | null;
  leaseYear?: number;
  associatedLeaseStart?: string;
  associatedLeaseEnd?: string;
  leaseId?: string; // Added leaseId to the interface
}

interface Resident {
  id: string;
  name: string;
  annualizedIncome: number;
  verifiedIncome: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Unit {
  id: string;
  unitNumber: string;
  squareFootage: number | null;
  bedroomCount: number | null;
  leases: Lease[];
}

interface RentRoll {
  id: string;
  date: string;
}

interface Lease {
  id: string;
  name: string;
  leaseStartDate: string;
  leaseEndDate: string;
  leaseRent: string | null;
  residents: Resident[];
  incomeVerifications: IncomeVerification[];
  tenancy?: { id: string; rentRollId: string; unitId: string; date: string }; // Added tenancy property
}

interface TenancyData {
  id: string;
  lease: Lease;
  unit: Unit;
  rentRoll: RentRoll;
}

interface NewResident {
  name: string;
}

// --- NEW VerificationRow Component ---

function VerificationRow({ verification, lease, onActionComplete }: { verification: IncomeVerification, lease: Lease, onActionComplete: () => void }) {
  
  const getResidentName = (residentId: string) => {
    return lease.residents.find(r => r.id === residentId)?.name || 'Unknown Resident';
  }

  const handleDelete = async (documentId: string) => {
    if (!window.confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }
    try {
      // Note: This endpoint would also need to be created if it doesn't exist.
      // For now, assuming it will exist at /api/leases/:leaseId/documents/:documentId
      const res = await fetch(`/api/leases/${lease.id}/documents/${documentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete document');
      }
      onActionComplete();
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : 'An unexpected error occurred'}`);
    }
  };

  return (
    <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h4 className="font-semibold text-gray-800">
            Verification Period ({verification.status})
          </h4>
          <p className="text-xs text-gray-500">
            Started: {format(new Date(verification.createdAt), 'MM/dd/yyyy')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-500">Calculated Income</p>
          <p className="font-semibold text-lg text-green-600">
            {verification.calculatedVerifiedIncome 
              ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verification.calculatedVerifiedIncome)
              : <span className="text-gray-400">N/A</span>
            }
          </p>
        </div>
      </div>
      
      {verification.incomeDocuments.length > 0 ? (
        <ul className="space-y-3">
          {verification.incomeDocuments.map((doc) => (
            <li key={doc.id} className="p-3 border rounded-md bg-white shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-gray-800">{doc.documentType}</p>
                  <p className="text-sm text-gray-500">
                    For: <span className="font-medium">{getResidentName((doc as any).residentId)}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Uploaded: {format(new Date(doc.uploadDate), 'MM/dd/yyyy')}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                   <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      doc.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                      doc.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                      doc.status === 'NEEDS_REVIEW' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {doc.status}
                    </span>
                  <button 
                    onClick={() => handleDelete(doc.id)}
                    className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100"
                    aria-label="Delete document"
                  >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                  </button>
                </div>
              </div>
              {doc.documentType === 'W2' && doc.status === 'COMPLETED' && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                  <p><strong>Tax Year:</strong> {doc.taxYear || 'N/A'}</p>
                  <p><strong>Employer:</strong> {doc.employerName || 'N/A'}</p>
                  <p><strong>Employee:</strong> {doc.employeeName || 'N/A'}</p>
                   <div className="grid grid-cols-3 gap-x-2 pt-1">
                    <p><strong>Box 1:</strong> {doc.box1_wages ? `$${doc.box1_wages.toLocaleString()}` : 'N/A'}</p>
                    <p><strong>Box 3:</strong> {doc.box3_ss_wages ? `$${doc.box3_ss_wages.toLocaleString()}` : 'N/A'}</p>
                    <p><strong>Box 5:</strong> {doc.box5_med_wages ? `$${doc.box5_med_wages.toLocaleString()}` : 'N/A'}</p>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 text-center py-2">No documents in this period yet.</p>
      )}
    </div>
  );
}


// --- UPDATED ResidentRow Component ---

function ResidentRow({ resident, totalIncome }: { resident: Resident, totalIncome: number }) {
  const residentIncome = resident.annualizedIncome || 0;
  const incomePercentage = totalIncome > 0 ? (residentIncome / totalIncome) * 100 : 0;
  
  return (
    <tr key={resident.id}>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {resident.name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(residentIncome)}
      </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {resident.verifiedIncome 
          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(resident.verifiedIncome)
          : <span className="text-gray-400">N/A</span>
        }
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {incomePercentage.toFixed(1)}%
      </td>
    </tr>
  );
}

// --- UPDATED ResidentDetailPage Component & Polling Logic ---

export default function ResidentDetailPage() {
  const params = useParams();
  const { id: propertyId, rentRollId, unitId } = params;
  
  const [tenancyData, setTenancyData] = useState<TenancyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finalizationDialog, setFinalizationDialog] = useState<{
    isOpen: boolean;
    verification: IncomeVerification | null;
  }>({ isOpen: false, verification: null });
  const [isCreateLeaseDialogOpen, setCreateLeaseDialogOpen] = useState(false);
  const [isAddResidentDialogOpen, setAddResidentDialogOpen] = useState(false);
  const [isRenewalDialogOpen, setRenewalDialogOpen] = useState(false);
  const [isInitialAddResidentDialogOpen, setInitialAddResidentDialogOpen] = useState(false);
  const [isUploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDialogData, setUploadDialogData] = useState<{
    verificationId: string;
    leaseName: string;
    residents: Array<{ id: string; name: string }>;
    hasExistingDocuments: boolean;
  } | null>(null);
  const [selectedLeaseForResident, setSelectedLeaseForResident] = useState<Lease | null>(null);
  const [newLeaseName, setNewLeaseName] = useState('');
  const [newLeaseStart, setNewLeaseStart] = useState('');
  const [newLeaseEnd, setNewLeaseEnd] = useState('');
  const [newLeaseRent, setNewLeaseRent] = useState('');

  const handleDeleteLease = async (leaseId: string) => {
    if (
      !window.confirm(
        'Are you sure you want to delete this provisional lease?'
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/leases/${leaseId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete lease');
      }

      // Refetch data to update the UI
      fetchTenancyData();
      toast.success('Provisional lease deleted successfully.');
    } catch (error: unknown) {
      console.error('Error deleting lease:', error);
      toast.error((error instanceof Error ? error.message : 'An error occurred while deleting the lease.'));
    }
  };

  const handleAddResident = async (name: string, annualizedIncome: string) => {
    if (!selectedLeaseForResident) {
      toast.error('No lease selected to add resident to.');
      return;
    }

    try {
      const response = await fetch(`/api/leases/${selectedLeaseForResident.id}/residents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, annualizedIncome }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add resident');
      }

      toast.success('Resident added successfully.');
      fetchTenancyData(false); // Refetch data to update the UI
    } catch (error: unknown) {
      console.error('Error adding resident:', error);
      toast.error((error instanceof Error ? error.message : 'An error occurred while adding the resident.'));
      throw error; // Re-throw to keep the dialog in an error state if needed
    }
  };

  const handleCopyResidents = async (residentIds: string[], newResidents: NewResident[] = []) => {
    if (!selectedLeaseForResident) {
      toast.error('No lease selected to add residents to.');
      return;
    }

    try {
      // Copy existing residents if any are selected
      if (residentIds.length > 0) {
        const copyResponse = await fetch(`/api/leases/${selectedLeaseForResident.id}/copy-residents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ residentIds }),
        });

        if (!copyResponse.ok) {
          const errorData = await copyResponse.json();
          throw new Error(errorData.error || 'Failed to copy existing residents');
        }
      }

      // Add new residents if any are provided
      if (newResidents.length > 0) {
        for (const newResident of newResidents) {
          const addResponse = await fetch(`/api/leases/${selectedLeaseForResident.id}/residents`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              name: newResident.name, 
              annualizedIncome: '0' // Default to 0, income will be set during verification process
            }),
          });

          if (!addResponse.ok) {
            const errorData = await addResponse.json();
            throw new Error(errorData.error || `Failed to add new resident: ${newResident.name}`);
          }
        }
      }

      // Show appropriate success message
      const totalResidents = residentIds.length + newResidents.length;
      if (residentIds.length > 0 && newResidents.length > 0) {
        toast.success(`Successfully added ${residentIds.length} existing and ${newResidents.length} new residents.`);
      } else if (residentIds.length > 0) {
        toast.success(`Successfully copied ${residentIds.length} existing residents.`);
      } else if (newResidents.length > 0) {
        toast.success(`Successfully added ${newResidents.length} new residents.`);
      }

      fetchTenancyData(false);
    } catch (error: unknown) {
      console.error('Error adding residents:', error);
      toast.error((error instanceof Error ? error.message : 'An error occurred while adding residents.'));
      throw error;
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete document');
      }

      toast.success('Document deleted successfully.');
      fetchTenancyData(false); // Refresh data
    } catch (error: unknown) {
      console.error('Error deleting document:', error);
      toast.error((error instanceof Error ? error.message : 'An error occurred while deleting the document.'));
    }
  };

  const formatUnitNumber = (unitNumber: string) => parseInt(unitNumber, 10).toString();

  const handleStartVerification = async (leaseId: string) => {
    if (!tenancyData) return;
    
    // Only show confirmation if there's an existing in-progress verification
    const lease = tenancyData.unit.leases.find(l => l.id === leaseId);
    const hasInProgressVerification = lease?.incomeVerifications?.some(v => v.status === 'IN_PROGRESS');
    if (hasInProgressVerification && !window.confirm('Are you sure you want to start a new verification period? This will finalize the current in-progress period.')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/leases/${leaseId}/verifications`, {
            method: 'POST',
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to start new verification');
        }

        const newVerification = await res.json();
        
        // Set up dialog data and open it
        setUploadDialogData({
          verificationId: newVerification.id,
          leaseName: lease?.name || 'Unknown Lease',
          residents: lease?.residents.map(r => ({ id: r.id, name: r.name })) || [],
          hasExistingDocuments: false
        });
        setUploadDialogOpen(true);

        fetchTenancyData(false); // This will refetch the data and update the UI
    } catch (err: unknown) {
        alert(`Error: ${err instanceof Error ? err.message : 'An unexpected error occurred'}`);
    }
  };

  const handleOpenFinalizationDialog = (verification: IncomeVerification) => {
    setFinalizationDialog({ isOpen: true, verification });
  };

  const handleCloseFinalizationDialog = () => {
    setFinalizationDialog({ isOpen: false, verification: null });
  };

  const handleFinalizeVerification = async (calculatedIncome: number) => {
    if (!finalizationDialog.verification || !tenancyData) return;
    const leaseId = finalizationDialog.verification.leaseId; // Correct way to get leaseId
    const verificationId = finalizationDialog.verification.id;
    
    try {
      const res = await fetch(`/api/leases/${leaseId}/verifications/${verificationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          calculatedVerifiedIncome: calculatedIncome,
        }),
      });

      if (!res.ok) {
        // Try to parse the error, but have a fallback.
        let errorMsg = 'Failed to finalize verification';
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch (e) {
          // The response was not JSON, which can happen on some server errors.
          console.error("Could not parse error response as JSON", res.status, res.statusText);
        }
        throw new Error(errorMsg);
      }

      const result = await res.json();
      
      // Close dialog and refresh data
      handleCloseFinalizationDialog();
      fetchTenancyData(false);
      
      // Show success message
      toast.success('Verification finalized successfully!');
      
    } catch (err: unknown) {
      console.error('Finalization error:', err);
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred');
      // We don't need to re-throw. The toast will show the error.
    }
  };

  const handleCreateLease = async (leaseData: { name: string; leaseStartDate: string; leaseEndDate: string; leaseRent: number | null }) => {
    try {
      const res = await fetch(`/api/units/${unitId}/leases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(leaseData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create lease');
      }

      const newLease = await res.json();
      
      setCreateLeaseDialogOpen(false);
      
      // Automatically open the "Add Resident" dialog for the newly created lease
      setSelectedLeaseForResident(newLease);
      setInitialAddResidentDialogOpen(true);
      
      fetchTenancyData(false);
    } catch (err: unknown) {
      alert(`Error creating lease: ${err instanceof Error ? err.message : 'An unexpected error occurred'}`);
    }
  };

  const fetchTenancyData = useCallback(async (showLoadingSpinner = true) => {
    if (!propertyId || !rentRollId || !unitId) {
      setError('Missing required parameters');
      if (showLoadingSpinner) setLoading(false);
      return;
    }
    try {
      if (showLoadingSpinner) setLoading(true);
      const response = await fetch(`/api/properties/${propertyId}/rent-roll/${rentRollId}/unit/${unitId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch tenancy data');
      }
      const data = await response.json();
      setTenancyData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  }, [propertyId, rentRollId, unitId]);

  useEffect(() => {
    fetchTenancyData();
  }, [fetchTenancyData]);

  // Updated Effect for polling
  useEffect(() => {
    const isProcessing = tenancyData?.lease.incomeVerifications.some(v =>
        v.incomeDocuments.some(d => d.status === 'PROCESSING' || d.status === 'UPLOADED')
    );

    if (isProcessing) {
      const interval = setInterval(() => {
        fetchTenancyData(false);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [tenancyData, fetchTenancyData]);

  // New function to create lease periods based on tenancy data
  const createLeasePeriods = () => {
    if (!tenancyData) return [];
    
    // TODO: Implement rent roll reconciliation logic.
    // This function currently displays all leases for a unit. In the future, we will need to
    // implement a mechanism to match provisional leases with new tenancies from rent roll uploads.
    // This could involve a UI where the user can select a provisional lease to link to a new tenancy.

    return tenancyData.unit.leases.map(lease => {
      const leaseStart = lease.leaseStartDate ? new Date(lease.leaseStartDate) : null;
      const leaseEnd = lease.leaseEndDate ? new Date(lease.leaseEndDate) : null;
      const currentDate = new Date();

      const verification = lease.incomeVerifications.find(v => v.status === 'IN_PROGRESS') || lease.incomeVerifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      return {
        ...lease,
        periodStart: leaseStart,
        periodEnd: leaseEnd,
        isCurrentPeriod: leaseStart && leaseEnd && currentDate >= leaseStart && currentDate <= leaseEnd,
        status: getPeriodStatus({ verification }),
        verification,
        isProvisional: !lease.tenancy,
      };
    }).sort((a, b) => {
      // Leases without a start date should be treated as newest and appear first
      if (a.periodStart && !b.periodStart) return 1;
      if (!a.periodStart && b.periodStart) return -1;
      // If neither has a start date, maintain their relative order (e.g., by creation)
      if (!a.periodStart && !b.periodStart) return 0; 
      // If both have start dates, sort the newest date first
      return b.periodStart!.getTime() - a.periodStart!.getTime();
    });
  };

  const getPeriodStatus = (period: { verification?: IncomeVerification | null }) => {
    if (!period.verification) return 'needs_verification';
    if (period.verification.status === 'IN_PROGRESS') return 'in_progress';
    if (period.verification.status === 'FINALIZED') return 'completed';
    if (period.verification.dueDate && new Date(period.verification.dueDate) < new Date()) return 'overdue';
    return 'pending';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">✓ Verified</span>;
      case 'in_progress':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">📝 In Progress</span>;
      case 'overdue':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">⚠️ Overdue</span>;
      case 'needs_verification':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">📋 Needs Verification</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Pending</span>;
    }
  };



  const leasePeriods = createLeasePeriods();


  if (loading) {
     return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-brand-blue mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading resident details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
         <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h2>
          <p className="text-red-600">{error}</p>
          <Link href={`/property/${propertyId}`} className="inline-block mt-4 text-brand-blue hover:underline">
            ← Back to Property
          </Link>
        </div>
      </div>
    );
  }

  if (!tenancyData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">No Data Found</h2>
          <p className="text-gray-600 mb-4">No tenancy data found for this unit and rent roll.</p>
          <Link href={`/property/${propertyId}`} className="text-brand-blue hover:underline">
            ← Back to Property
          </Link>
        </div>
      </div>
    );
  }

  const totalIncome = tenancyData?.lease.residents.reduce((sum, resident) => 
    sum + (resident.annualizedIncome || 0), 0
  ) || 0;

  const inProgressVerification = tenancyData?.lease.incomeVerifications.find(v => v.status === 'IN_PROGRESS');
  const finalizedVerifications = tenancyData?.lease.incomeVerifications.filter(v => v.status !== 'IN_PROGRESS');

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      <div className="container mx-auto px-4 py-8">
        <Link
          href={`/property/${propertyId}`}
          className="text-brand-blue hover:underline mb-4 inline-block"
        >
          ← Back to Property
        </Link>
        <h1 className="text-4xl font-bold text-brand-blue">Unit {formatUnitNumber(tenancyData.unit.unitNumber)} - Resident Details</h1>
      </div>

       <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold text-brand-blue mb-4">Unit Information</h2>
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Unit Number</p>
            <p className="text-lg font-semibold text-gray-900">{formatUnitNumber(tenancyData.unit.unitNumber)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Square Footage</p>
            <p className="text-lg font-semibold text-gray-900">
              {tenancyData.unit.squareFootage ? tenancyData.unit.squareFootage.toLocaleString() : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Bedrooms</p>
            <p className="text-lg font-semibold text-gray-900">
              {tenancyData.unit.bedroomCount ?? 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Lease Rent</p>
            <p className="text-lg font-semibold text-gray-900">
              {tenancyData.lease.leaseRent 
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(tenancyData.lease.leaseRent))
                : 'N/A'
              }
            </p>
          </div>
        </div>
      </div>

       <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-brand-blue">Lease Period Income Verification</h2>
          <button
            onClick={() => setCreateLeaseDialogOpen(true)}
            className="px-4 py-2 bg-brand-blue text-white rounded-md hover:bg-blue-700"
          >
            Create New Lease
          </button>
        </div>

        {leasePeriods.length === 0 ? (
          <div className="text-center p-4 border-dashed border-2 border-gray-300 rounded-lg">
            <p className="text-gray-500">No lease periods found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lease Period
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Verification Details
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leasePeriods.map((period) => (
                  <Fragment key={period.id}>
                    <tr className={period.isCurrentPeriod ? 'bg-blue-50' : ''}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {period.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {period.periodStart && period.periodEnd ? (
                            `${format(period.periodStart, 'MMM d, yyyy')} - ${format(period.periodEnd, 'MMM d, yyyy')}`
                          ) : (
                            'Lease Term Not Defined'
                          )}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {period.residents.length} {period.residents.length === 1 ? 'resident' : 'residents'}
                        </div>
                        {period.isCurrentPeriod && (
                          <span className="ml-2 text-blue-600 font-semibold">Current Period</span>
                        )}
                        {period.verification?.dueDate && (
                          <div className="text-xs text-red-600 mt-1 font-medium">
                            Due: {format(new Date(period.verification.dueDate), 'MMM d, yyyy')}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {period.verification ? (
                          <div className="space-y-2">
                            <div className="text-xs text-gray-500">
                              <div>Started: {format(new Date(period.verification.createdAt), 'MMM d, yyyy')}</div>
                              {period.verification.reason && (
                                <div className="capitalize">
                                  Reason: {period.verification.reason.replace('_', ' ').toLowerCase()}
                                </div>
                              )}
                            </div>
                            {period.verification.incomeDocuments && period.verification.incomeDocuments.length > 0 ? (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-gray-700">Documents ({period.verification.incomeDocuments.length}):</div>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                  {period.verification.incomeDocuments.map((doc) => {
                                    // Find the resident for this document
                                    const resident = tenancyData?.unit.leases.find(l => l.id === period.id)?.residents.find(r => r.id === doc.residentId);
                                    return (
                                      <div key={doc.id} className="text-xs border rounded p-2 bg-gray-50">
                                        <div className="flex items-center justify-between mb-1">
                                          <div className="flex items-center space-x-2">
                                            <span className="font-medium text-gray-700">{doc.documentType}</span>
                                            {resident && (
                                              <span className="text-xs text-blue-600 font-medium">({resident.name})</span>
                                            )}
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                              doc.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                              doc.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                                              'bg-red-100 text-red-800'
                                            }`}>
                                              {doc.status}
                                            </span>
                                            <button
                                              onClick={() => {
                                                handleDeleteDocument(doc.id);
                                              }}
                                              className="text-red-500 hover:text-red-700 ml-4"
                                              aria-label={`Delete document ${doc.documentType}`}
                                            >
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                              </svg>
                                            </button>
                                          </div>
                                        </div>
                                        {doc.documentType === 'W2' && doc.status === 'COMPLETED' && (
                                          <div className="mt-1 text-gray-600 space-y-1">
                                            {doc.taxYear && <div>Tax Year: {doc.taxYear}</div>}
                                            {doc.employerName && <div>Employer: {doc.employerName}</div>}
                                            {doc.box1_wages && (
                                              <div className="font-medium text-green-700">
                                                Wages: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box1_wages)}
                                              </div>
                                            )}
                                            {doc.box3_ss_wages && (
                                              <div className="text-sm">
                                                Social Security Wages: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box3_ss_wages)}
                                              </div>
                                            )}
                                            {doc.box5_med_wages && (
                                              <div className="text-sm">
                                                Medicare Wages: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box5_med_wages)}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                        {doc.uploadDate && (
                                          <div className="text-gray-400 mt-1">
                                            Uploaded: {format(new Date(doc.uploadDate), 'MMM d, yyyy')}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 italic">No documents uploaded yet</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 italic">No verification started</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(period.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex flex-col space-y-2">
                          {period.status === 'needs_verification' && (
                            <button 
                              onClick={() => handleStartVerification(period.id)}
                              className="text-brand-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md transition-colors"
                            >
                              Verify Income
                            </button>
                          )}
                          {period.status === 'in_progress' && period.verification && (
                            <>
                              <button 
                                onClick={() => {
                                  setUploadDialogData({
                                    verificationId: period.verification!.id,
                                    leaseName: period.name,
                                    residents: period.residents.map(r => ({ id: r.id, name: r.name })),
                                    hasExistingDocuments: !!period.verification?.incomeDocuments?.length
                                  });
                                  setUploadDialogOpen(true);
                                }}
                                className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md transition-colors block w-full text-left"
                              >
                                Continue Verification
                              </button>
                              <button 
                                onClick={() => handleOpenFinalizationDialog(period.verification!)}
                                className="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-md transition-colors block w-full text-left"
                              >
                                Finalize Verification
                              </button>
                            </>
                          )}
                          {period.status === 'completed' && period.verification && (
                            <button 
                              onClick={() => {/* TODO: View verification details */}}
                              className="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-md transition-colors"
                            >
                              View Details
                            </button>
                          )}
                          {period.isProvisional && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedLeaseForResident(period);
                                  setInitialAddResidentDialogOpen(true);
                                }}
                                className="text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-md transition-colors block w-full text-left"
                              >
                                Add Resident
                              </button>
                              <button
                                onClick={() => handleDeleteLease(period.id)}
                                className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-md transition-colors block w-full text-left"
                              >
                                Delete Lease
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* The upload form is now rendered within the table for the corresponding lease period. */}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
         <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-brand-blue">Resident Information</h2>
          <p className="text-sm text-gray-500">
            As of: <span className="font-medium">{new Date(tenancyData.rentRoll.date).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</span>
          </p>
        </div>
        
        {tenancyData.lease.residents.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No residents found for this unit in the selected rent roll.</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-lg font-medium text-gray-700">
                  Total Residents: <span className="font-semibold">{tenancyData.lease.residents.length}</span>
                </p>
                <p className="text-lg font-medium text-gray-700">
                  Total Household Income: <span className="font-semibold text-green-600">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalIncome)}
                  </span>
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                     <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Resident Name
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Annualized Income
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Verified Income
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % of Total Income
                    </th>
                  </tr>
                </thead>
                 <tbody className="bg-white divide-y divide-gray-200">
                  {tenancyData.lease.residents.map((resident) => (
                    <ResidentRow key={resident.id} resident={resident} totalIncome={totalIncome} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Finalization Dialog */}
      {finalizationDialog.verification && (
        <VerificationFinalizationDialog
          isOpen={finalizationDialog.isOpen}
          onClose={handleCloseFinalizationDialog}
          onConfirm={handleFinalizeVerification}
          verification={finalizationDialog.verification}
          residents={tenancyData?.unit.leases.find(l => l.id === finalizationDialog.verification?.leaseId)?.residents || []}
        />
      )}
      <CreateLeaseDialog
        isOpen={isCreateLeaseDialogOpen}
        onClose={() => setCreateLeaseDialogOpen(false)}
        onSubmit={handleCreateLease}
        unitId={unitId as string}
      />
      {selectedLeaseForResident && (
        <InitialAddResidentDialog
          isOpen={isInitialAddResidentDialogOpen}
          onClose={() => setInitialAddResidentDialogOpen(false)}
          onRenewal={() => {
            setInitialAddResidentDialogOpen(false);
            setRenewalDialogOpen(true);
          }}
          onNewApplicant={() => {
            setInitialAddResidentDialogOpen(false);
            setAddResidentDialogOpen(true);
          }}
          leaseName={selectedLeaseForResident.name}
        />
      )}
      {selectedLeaseForResident && (
        <AddResidentDialog
          isOpen={isAddResidentDialogOpen}
          onClose={() => setAddResidentDialogOpen(false)}
          onSubmit={handleAddResident}
          leaseName={selectedLeaseForResident.name}
        />
      )}
      {selectedLeaseForResident && (
        <RenewalDialog
          isOpen={isRenewalDialogOpen}
          onClose={() => setRenewalDialogOpen(false)}
          onAddSelected={handleCopyResidents}
          leaseName={selectedLeaseForResident.name}
          currentResidents={
            tenancyData.unit.leases.find(l => l.tenancy && l.leaseStartDate)
              ?.residents || []
          }
        />
      )}

      {uploadDialogData && (
        <IncomeVerificationUploadDialog
          isOpen={isUploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          verificationId={uploadDialogData.verificationId}
          onUploadComplete={() => fetchTenancyData(false)}
          residents={uploadDialogData.residents}
          hasExistingDocuments={uploadDialogData.hasExistingDocuments}
          leaseName={uploadDialogData.leaseName}
        />
      )}
    </div>
  );
}
