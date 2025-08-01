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
import ResidentFinalizationDialog from '@/components/ResidentFinalizationDialog';
import { format } from 'date-fns';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getUnitVerificationStatus, type VerificationStatus } from '@/services/verification';

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
  payPeriodStartDate?: string;
  payPeriodEndDate?: string;
  grossPayAmount?: number;
  payFrequency?: string;
  calculatedAnnualizedIncome?: number;
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
  calculatedAnnualizedIncome?: number; // Add calculatedAnnualizedIncome to Resident interface
  incomeFinalized?: boolean; // Add incomeFinalized field
  finalizedAt?: string | null; // Add finalizedAt field
  hasNoIncome?: boolean; // Add hasNoIncome field
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

// Helper function to format pay frequency for display
const formatPayFrequency = (frequency: string): string => {
  switch (frequency) {
    case 'BI_WEEKLY':
      return 'Bi-Weekly';
    case 'WEEKLY':
      return 'Weekly';
    case 'SEMI_MONTHLY':
      return 'Semi-Monthly';
    case 'MONTHLY':
      return 'Monthly';
    case 'UNKNOWN':
      return 'Unknown';
    default:
      return frequency;
  }
};

// --- NEW VerificationRow Component ---

function VerificationRow({ verification, lease, onActionComplete }: { verification: IncomeVerification, lease: Lease, onActionComplete: () => void }) {
  
  const getResidentName = (residentId: string) => {
    return lease.residents.find(r => r.id === residentId)?.name || 'Unknown Resident';
  };

  // Check if any residents in the lease have finalized income
  const hasAnyFinalizedResidents = lease.residents.some(resident => resident.incomeFinalized);

  // Only show verified income if residents have been finalized
  const shouldShowVerifiedIncome = hasAnyFinalizedResidents && verification.calculatedVerifiedIncome;

  const isInProgress = verification.status === 'IN_PROGRESS';
  const isCompleted = verification.status === 'COMPLETED';

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
          <p className="font-semibold text-lg">
            {shouldShowVerifiedIncome 
              ? <span className="text-green-600">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verification.calculatedVerifiedIncome || 0)}</span>
              : <span className="text-gray-400">Not Finalized</span>
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
              {doc.documentType === 'W2' && (
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
              {doc.documentType === 'PAYSTUB' && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                  <p><strong>Employee:</strong> {doc.employeeName || 'N/A'}</p>
                  <p><strong>Employer:</strong> {doc.employerName || 'N/A'}</p>
                  {doc.payPeriodStartDate && doc.payPeriodEndDate && (
                    <p><strong>Pay Period:</strong> {format(new Date(doc.payPeriodStartDate), 'MMM d')} - {format(new Date(doc.payPeriodEndDate), 'MMM d, yyyy')}</p>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 pt-1">
                    <p><strong>Gross Pay:</strong> {doc.grossPayAmount ? `$${doc.grossPayAmount.toLocaleString()}` : 'N/A'}</p>
                    {doc.payFrequency && (
                      <p><strong>Pay Frequency:</strong> {formatPayFrequency(doc.payFrequency)}</p>
                    )}
                  </div>
                  {doc.calculatedAnnualizedIncome && (
                    <p className="pt-1 font-medium text-green-700">
                      <strong>Calculated Annual Income:</strong> ${doc.calculatedAnnualizedIncome.toLocaleString()}
                    </p>
                  )}
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

  // AMI bucket calculation state
  const [amiBucketData, setAmiBucketData] = useState<Record<string, any>>({});
  
  // Unit verification status state
  const [unitVerificationStatus, setUnitVerificationStatus] = useState<VerificationStatus>('Vacant');
  const [selectedLeaseForResident, setSelectedLeaseForResident] = useState<Lease | null>(null);
  const [isNewLeaseWorkflow, setIsNewLeaseWorkflow] = useState(false);
  const [newLeaseName, setNewLeaseName] = useState('');
  const [newLeaseStart, setNewLeaseStart] = useState('');
  const [newLeaseEnd, setNewLeaseEnd] = useState('');
  const [newLeaseRent, setNewLeaseRent] = useState('');

  // New state for resident-specific finalization
  const [residentFinalizationDialog, setResidentFinalizationDialog] = useState<{
    isOpen: boolean;
    verification: IncomeVerification | null;
    resident: Resident | null;
    leaseName: string;
  }>({ isOpen: false, verification: null, resident: null, leaseName: '' });

  // New state for resident selection during lease verification
  const [residentSelectionDialog, setResidentSelectionDialog] = useState<{
    isOpen: boolean;
    verificationId: string | null;
    leaseName: string;
    residents: Array<{ id: string; name: string }>;
  }>({ isOpen: false, verificationId: null, leaseName: '', residents: [] });

  // Helper function to clean up new lease workflow state
  const resetNewLeaseWorkflow = () => {
    setIsNewLeaseWorkflow(false);
    setSelectedLeaseForResident(null);
  };

  // Handler for marking a resident as having no income
  const handleMarkNoIncome = async (leaseId: string, verificationId: string, residentId: string, residentName: string) => {
    if (!window.confirm(`Mark ${residentName} as having no income? This will finalize their verification with $0 income.`)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/leases/${leaseId}/verifications/${verificationId}/residents/${residentId}/no-income`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to mark resident as no income');
      }

      // Refresh the data
      fetchTenancyData(false);
      fetchUnitVerificationStatus();
    } catch (error) {
      console.error('Error marking resident as no income:', error);
      alert(error instanceof Error ? error.message : 'Failed to mark resident as no income');
    }
  };

  // Handler for when a resident is selected from the resident selection dialog
  const handleResidentSelected = (residentId: string) => {
    const { verificationId, leaseName, residents } = residentSelectionDialog;
    const selectedResident = residents.find(r => r.id === residentId);
    
    if (!verificationId || !selectedResident) return;
    
    // Close resident selection dialog
    setResidentSelectionDialog({ 
      isOpen: false, 
      verificationId: null, 
      leaseName: '', 
      residents: [] 
    });
    
    // Open upload dialog for selected resident
    setUploadDialogData({
      verificationId: verificationId,
      leaseName: leaseName,
      residents: [selectedResident], // Only the selected resident
      hasExistingDocuments: false
    });
    setUploadDialogOpen(true);
  };

  // Handler to close resident selection dialog
  const handleCloseResidentSelection = () => {
    setResidentSelectionDialog({ 
      isOpen: false, 
      verificationId: null, 
      leaseName: '', 
      residents: [] 
    });
  };

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

  const handleAddResident = async (residents: Array<{ name: string }>) => {
    if (!selectedLeaseForResident) {
      toast.error('No lease selected to add residents to.');
      return;
    }

    try {
      // Add each resident individually
      for (const resident of residents) {
        const response = await fetch(`/api/leases/${selectedLeaseForResident.id}/residents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            name: resident.name, 
            annualizedIncome: '0' // Default to 0, income will be set during verification process
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to add resident: ${resident.name}`);
        }
      }

      // Show appropriate success message
      const residentCount = residents.length;
      toast.success(`Successfully added ${residentCount} ${residentCount === 1 ? 'resident' : 'residents'}.`);
      
      // If this was a new lease workflow, automatically start income verification
      if (isNewLeaseWorkflow && selectedLeaseForResident) {
        // Fetch fresh data to get all current residents
        await fetchTenancyData(false);
        
        // Get current residents for the lease (including the one we just added)
        const res = await fetch(`/api/properties/${propertyId}/rent-roll/${rentRollId}/unit/${unitId}`);
        const freshData = await res.json();
        const currentLease = freshData.unit.leases.find((l: any) => l.id === selectedLeaseForResident.id);
        const currentResidents = currentLease?.residents?.map((r: any) => ({ id: r.id, name: r.name })) || [];
        
        setTimeout(() => {
          handleStartVerification(selectedLeaseForResident.id, currentResidents);
        }, 200); // Small delay to ensure everything is ready
        setIsNewLeaseWorkflow(false); // Reset the flag
      } else {
        fetchTenancyData(false); // Refetch data to update the UI
      }
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

      // If this was a new lease workflow, automatically start income verification
      if (isNewLeaseWorkflow && selectedLeaseForResident) {
        // Fetch fresh data to get all current residents
        await fetchTenancyData(false);
        
        // Get current residents for the lease
        const res = await fetch(`/api/properties/${propertyId}/rent-roll/${rentRollId}/unit/${unitId}`);
        const freshData = await res.json();
        const currentLease = freshData.unit.leases.find((l: any) => l.id === selectedLeaseForResident.id);
        const currentResidents = currentLease?.residents?.map((r: any) => ({ id: r.id, name: r.name })) || [];
        
        setTimeout(() => {
          handleStartVerification(selectedLeaseForResident.id, currentResidents);
        }, 200); // Small delay to ensure everything is ready
        setIsNewLeaseWorkflow(false); // Reset the flag
      } else {
        fetchTenancyData(false);
      }
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
      fetchUnitVerificationStatus(); // Refresh verification status
    } catch (error: unknown) {
      console.error('Error deleting document:', error);
      toast.error((error instanceof Error ? error.message : 'An error occurred while deleting the document.'));
    }
  };

  const formatUnitNumber = (unitNumber: string): string => {
    // Remove leading zeros from unit numbers like "0101" -> "101"
    return unitNumber.replace(/^0+/, '') || '0';
  };

  const handleStartVerification = async (leaseId: string, overrideResidents?: Array<{ id: string; name: string }>) => {
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
        
        // If we have override residents (from fresh addition), use those
        // Otherwise, refresh data and get current residents from state
        if (overrideResidents) {
          setUploadDialogData({
            verificationId: newVerification.id,
            leaseName: lease?.name || 'Unknown Lease',
            residents: overrideResidents,
            hasExistingDocuments: false
          });
          setUploadDialogOpen(true);
          fetchTenancyData(false); // Refresh data in background
        } else {
          // Refresh data and then open resident selection dialog  
          await fetchTenancyData(false);
          
          // Use setTimeout to ensure React state has updated after fetchTenancyData
          setTimeout(() => {
            const currentLease = tenancyData?.unit.leases.find(l => l.id === leaseId);
            const residents = currentLease?.residents.map(r => ({ id: r.id, name: r.name })) || [];
            
            setResidentSelectionDialog({
              isOpen: true,
              verificationId: newVerification.id,
              leaseName: currentLease?.name || 'Unknown Lease',
              residents: residents
            });
          }, 100); // Small delay to ensure state update
        }
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

  // New handlers for resident-specific finalization
  const handleOpenResidentFinalizationDialog = async (verification: IncomeVerification, resident: Resident, periodName: string) => {
    // If the resident is already finalized and this is called from the "Modify" button,
    // automatically unfinalize them first
    if (resident.incomeFinalized) {
      console.log(`[MODIFY ACTION] Auto-unfinalizing resident ${resident.id} (${resident.name})`);
      
      try {
        const leaseId = verification.leaseId;
        const verificationId = verification.id;
        
        const response = await fetch(`/api/leases/${leaseId}/verifications/${verificationId}/residents/${resident.id}/unfinalize`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          console.log(`[MODIFY ACTION] Successfully unfinalized resident ${resident.id}`);
          // Refresh the page to show the updated state
          window.location.reload();
          return;
        } else {
          console.error(`[MODIFY ACTION] Failed to unfinalize resident: ${response.status}`);
          alert('Failed to unfinalize resident income. Please try again.');
          return;
        }
      } catch (error) {
        console.error(`[MODIFY ACTION] Error unfinalizing resident:`, error);
        alert('Error unfinalizing resident income. Please try again.');
        return;
      }
    }

    // Only open the dialog if the resident is not finalized
    setResidentFinalizationDialog({ 
      isOpen: true, 
      verification, 
      resident, 
      leaseName: periodName 
    });
  };

  const handleCloseResidentFinalizationDialog = () => {
    setResidentFinalizationDialog({ 
      isOpen: false, 
      verification: null, 
      resident: null, 
      leaseName: '' 
    });
  };



  const handleFinalizeResidentVerification = async (calculatedIncome: number) => {
    if (!residentFinalizationDialog.verification || !residentFinalizationDialog.resident) return;
    
    const { verification, resident } = residentFinalizationDialog;
    const leaseId = verification.leaseId;
    const verificationId = verification.id;
    const residentId = resident.id;
    
    try {
      const res = await fetch(`/api/leases/${leaseId}/verifications/${verificationId}/residents/${residentId}/finalize`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          calculatedVerifiedIncome: calculatedIncome,
        }),
      });

      if (!res.ok) {
        let errorMsg = 'Failed to finalize resident verification';
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch (e) {
          console.error("Could not parse error response as JSON", res.status, res.statusText);
        }
        throw new Error(errorMsg);
      }

      const result = await res.json();
      
      // Close dialog and refresh data
      handleCloseResidentFinalizationDialog();
      fetchTenancyData(false);
      fetchUnitVerificationStatus();
      
      if (result.verificationFinalized) {
        toast.success(`${resident.name}'s income finalized! All residents verified - lease verification complete!`);
      } else {
        toast.success(`${resident.name}'s income finalized successfully!`);
      }
    } catch (error: unknown) {
      console.error('Error finalizing resident verification:', error);
      toast.error((error instanceof Error ? error.message : 'An error occurred while finalizing the resident verification.'));
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
      setIsNewLeaseWorkflow(true); // Mark this as a new lease workflow
      setInitialAddResidentDialogOpen(true);
      
      fetchTenancyData(false);
      fetchUnitVerificationStatus();
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

  // Call fetchUnitVerificationStatus when tenancyData is available
  useEffect(() => {
    if (tenancyData) {
      fetchUnitVerificationStatus();
    }
  }, [tenancyData]);

  // Updated Effect for polling
  useEffect(() => {
    const isProcessing = tenancyData?.lease.incomeVerifications.some(v =>
        v.incomeDocuments.some(d => d.status === 'PROCESSING' || d.status === 'UPLOADED')
    );

    if (isProcessing) {
      const interval = setInterval(() => {
        fetchTenancyData(false);
        fetchUnitVerificationStatus();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [tenancyData, fetchTenancyData]);

  // Function to fetch AMI bucket data for a completed lease
  const fetchAmiBucketData = async (leaseId: string) => {
    try {
      const response = await fetch(`/api/leases/${leaseId}/ami-bucket`);
      if (response.ok) {
        const data = await response.json();
        setAmiBucketData(prev => ({ ...prev, [leaseId]: data }));
      }
    } catch (error) {
      console.error('Error fetching AMI bucket data:', error);
    }
  };

  // Function to fetch verification status for this unit using already available data
  const fetchUnitVerificationStatus = async () => {
    if (!tenancyData?.unit) return;
    
    try {
      // Use the verification service with already-available tenancy data
      // No need to call the property-wide API!
      const verificationStatus = getUnitVerificationStatus(
        tenancyData.unit as any, // Type assertion to handle the interface differences
        new Date(tenancyData.rentRoll.date)
      );
      setUnitVerificationStatus(verificationStatus);
    } catch (error) {
      console.error('Error calculating unit verification status:', error);
    }
  };

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
      const status = getPeriodStatus({ verification });

      const isProvisional = !lease.tenancy;
      
      // Fetch AMI bucket data for completed provisional leases
      if (status === 'completed' && isProvisional && !amiBucketData[lease.id]) {
        fetchAmiBucketData(lease.id);
      }

      return {
        ...lease,
        periodStart: leaseStart,
        periodEnd: leaseEnd,
        isCurrentPeriod: leaseStart && leaseEnd && currentDate >= leaseStart && currentDate <= leaseEnd,
        status,
        verification,
        isProvisional: !lease.tenancy,
        amiBucketInfo: amiBucketData[lease.id],
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
          <h2 className="text-2xl font-semibold text-brand-blue">Resident Income Verification by Lease</h2>
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
          <div className="space-y-6">
            {leasePeriods.map((period) => {
              const verification = period.verification;
              const isInProgress = verification?.status === 'IN_PROGRESS';
              
              // Use the fetched verification status that matches the property table logic
              const currentVerificationStatus = verification?.status === 'IN_PROGRESS' 
                ? 'In Progress - Finalize to Process' 
                : unitVerificationStatus;
                
              const isCompleted = currentVerificationStatus === 'Verified';
              
              return (
                <div key={period.id} className={`border rounded-lg overflow-hidden ${period.isCurrentPeriod ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                  {/* Lease Header */}
                  <div className="bg-gray-50 px-6 py-4 border-b">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{period.name}</h3>
                        <div className="text-sm text-gray-600 mt-1">
                          {period.periodStart && period.periodEnd ? (
                            `${format(period.periodStart, 'MMM d, yyyy')} - ${format(period.periodEnd, 'MMM d, yyyy')}`
                          ) : (
                            'Lease Term Not Defined'
                          )}
                          {period.isCurrentPeriod && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Current Period</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {period.residents.length} {period.residents.length === 1 ? 'resident' : 'residents'}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {/* Overall Lease Status */}
                        <div className="text-right">
                          {(() => {
                            switch (currentVerificationStatus) {
                              case 'Verified':
                                return (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                                    ✓ Verified
                                  </span>
                                );
                              case 'In Progress - Finalize to Process':
                                return (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                                    📝 In Progress - Finalize to Process
                                  </span>
                                );
                              case 'Needs Investigation':
                                return (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                                    ⚠️ Needs Investigation
                                  </span>
                                );
                              case 'Out of Date Income Documents':
                                return (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                                    📅 Out of Date Income Documents
                                  </span>
                                );
                              case 'Vacant':
                                return (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                                    🏠 Vacant
                                  </span>
                                );
                              default:
                                return (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                                    📋 Needs Verification
                                  </span>
                                );
                            }
                          })()}
                        </div>
                        
                        {/* Lease Verified Income */}
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-500">Lease Verified Income</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {(() => {
                              // Calculate verified income for this specific lease
                              const leaseVerifiedIncome = period.residents.reduce((total, resident) => {
                                return total + (resident.incomeFinalized ? (resident.calculatedAnnualizedIncome || 0) : 0);
                              }, 0);
                              
                              return leaseVerifiedIncome > 0 
                                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(leaseVerifiedIncome)
                                : <span className="text-gray-400">Not Finalized</span>;
                            })()}
                          </p>
                        </div>
                        
                        {/* Lease Actions */}
                        <div className="flex flex-col space-y-1">
                          {!verification && (
                            <button 
                              onClick={() => handleStartVerification(period.id)}
                              className="text-sm font-semibold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                            >
                              🔍 Verify Lease Income
                            </button>
                          )}
                          {period.isProvisional && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedLeaseForResident(period);
                                  setInitialAddResidentDialogOpen(true);
                                }}
                                className="text-xs text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded transition-colors"
                              >
                                Add Resident
                              </button>
                              <button
                                onClick={() => handleDeleteLease(period.id)}
                                className="text-xs text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                              >
                                Delete Lease
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Residents List */}
                  {period.residents.length > 0 ? (
                    <div className="divide-y divide-gray-200">
                      {period.residents.map((resident) => {
                        // Filter documents for this resident - SHOW ALL DOCUMENTS
                        const residentDocuments = verification?.incomeDocuments?.filter(
                          doc => doc.residentId === resident.id
                        ) || [];
                        
                        // Calculate completed documents (status COMPLETED, regardless of calculated income)
                        const completedResidentDocuments = residentDocuments.filter(
                          doc => doc.status === 'COMPLETED'
                        );
                        
                        // Use resident-level calculated income instead of manual document aggregation
                        const residentVerifiedIncome = resident.calculatedAnnualizedIncome || 0;

                        const isResidentFinalized = resident.incomeFinalized || false;
                        const hasCompletedDocuments = completedResidentDocuments.length > 0;
                        
                        // Show documents if ANY documents exist (not just completed ones with calculated income)
                        const hasAnyDocuments = residentDocuments.length > 0;
                        
                        // Validation logic for this resident - allow finalization if they have completed documents, documents that need review, OR if they're marked as no income
                        const hasDocumentsNeedingReview = residentDocuments.some(doc => doc.status === 'NEEDS_REVIEW');
                        // Allow finalization if there are completed documents (income will be calculated during finalization), need review docs, or no income
                        const canFinalizeResident = (hasCompletedDocuments || hasDocumentsNeedingReview || resident.hasNoIncome) && !isResidentFinalized;

                        return (
                          <div key={resident.id} className="px-6 py-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-2">
                                  <h4 className="text-md font-medium text-gray-900">{resident.name}</h4>
                                  <div className="flex items-center space-x-2">
                                    {isResidentFinalized ? (
                                      resident.hasNoIncome ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                          ❌ No Income
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          ✓ Income Finalized
                                        </span>
                                      )
                                    ) : hasCompletedDocuments && residentVerifiedIncome > 0 ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                        📋 Ready to Finalize
                                      </span>
                                    ) : hasDocumentsNeedingReview ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                        ⚠️ Review Required
                                      </span>
                                    ) : hasCompletedDocuments ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                        ⚠️ Review Required
                                      </span>
                                    ) : hasAnyDocuments ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        📄 Documents Uploaded
                                      </span>
                                    ) : isInProgress ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        📝 Documents Needed
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                        ⏸️ Not Started
                                      </span>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                                  <div>
                                    <span className="font-medium">Original Income:</span> {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(resident.annualizedIncome)}
                                  </div>
                                  <div>
                                    <span className="font-medium">Verified Income:</span> {
                                      isResidentFinalized 
                                        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(residentVerifiedIncome)
                                        : <span className="text-gray-400">Not Finalized</span>
                                    }
                                  </div>
                                </div>

                                {/* Show documents if any */}
                                {hasAnyDocuments && (
                                  <div className="mt-3">
                                    <div className="text-xs font-medium text-gray-500 mb-2">Documents ({residentDocuments.length}):</div>
                                    <div className="space-y-2">
                                      {residentDocuments.map(doc => (
                                        <div key={doc.id} className="p-3 bg-green-50 border border-green-200 rounded-md">
                                          <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center space-x-2">
                                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
                                                {doc.documentType}
                                              </span>
                                              {doc.employeeName && (
                                                <span className="text-xs text-gray-600">
                                                  {doc.employeeName}
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center space-x-2">
                                              <span className="text-xs text-gray-500">
                                                {format(new Date(doc.uploadDate), 'MMM d, yyyy')}
                                              </span>
                                              {/* Delete Document Button */}
                                              {!isResidentFinalized && (
                                                <button
                                                  onClick={() => handleDeleteDocument(doc.id)}
                                                  className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                                                  title={`Delete ${doc.documentType} document`}
                                                >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                  </svg>
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                          
                                          {/* Document-specific details */}
                                          {doc.documentType === 'PAYSTUB' && (
                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                              {doc.payPeriodStartDate && doc.payPeriodEndDate && (
                                                <div>
                                                  <span className="font-medium text-gray-700">Pay Period:</span>
                                                  <div className="text-gray-600">
                                                    {format(new Date(doc.payPeriodStartDate), 'MMM d')} - {format(new Date(doc.payPeriodEndDate), 'MMM d')}
                                                  </div>
                                                </div>
                                              )}
                                              {doc.grossPayAmount && (
                                                <div>
                                                  <span className="font-medium text-gray-700">Gross Pay:</span>
                                                  <div className="text-green-700 font-semibold">
                                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.grossPayAmount)}
                                                  </div>
                                                </div>
                                              )}
                                              {doc.payFrequency && (
                                                <div>
                                                  <span className="font-medium text-gray-700">Frequency:</span>
                                                  <div className="text-gray-600">
                                                    {doc.payFrequency.replace('_', '-')}
                                                  </div>
                                                </div>
                                              )}
                                              {doc.employerName && (
                                                <div className="col-span-2">
                                                  <span className="font-medium text-gray-700">Employer:</span>
                                                  <div className="text-gray-600">
                                                    {doc.employerName}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          
                                          {doc.documentType === 'W2' && (
                                            <div className="space-y-2">
                                              {doc.status === 'COMPLETED' && doc.box1_wages ? (
                                                // Successfully extracted W2 data
                                                <div className="grid grid-cols-2 gap-3 text-xs">
                                                  {doc.taxYear && (
                                                    <div>
                                                      <span className="font-medium text-gray-700">Tax Year:</span>
                                                      <div className="text-gray-600">{doc.taxYear}</div>
                                                    </div>
                                                  )}
                                                  <div>
                                                    <span className="font-medium text-gray-700">Box 1 Wages:</span>
                                                    <div className="text-green-700 font-semibold">
                                                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box1_wages)}
                                                    </div>
                                                  </div>
                                                  {doc.box3_ss_wages && (
                                                    <div>
                                                      <span className="font-medium text-gray-700">Box 3 SS Wages:</span>
                                                      <div className="text-green-700 font-semibold">
                                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box3_ss_wages)}
                                                      </div>
                                                    </div>
                                                  )}
                                                  {doc.box5_med_wages && (
                                                    <div>
                                                      <span className="font-medium text-gray-700">Box 5 Medicare:</span>
                                                      <div className="text-green-700 font-semibold">
                                                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box5_med_wages)}
                                                      </div>
                                                    </div>
                                                  )}
                                                  {doc.employeeName && (
                                                    <div className="col-span-2">
                                                      <span className="font-medium text-gray-700">Employee:</span>
                                                      <div className="text-gray-600">
                                                        {doc.employeeName}
                                                      </div>
                                                    </div>
                                                  )}
                                                  {doc.employerName && (
                                                    <div className="col-span-2">
                                                      <span className="font-medium text-gray-700">Employer:</span>
                                                      <div className="text-gray-600">
                                                        {doc.employerName}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              ) : (
                                                // Failed extraction - show manual entry needed
                                                <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                                                  <div className="flex items-center mb-2">
                                                    <svg className="w-4 h-4 text-orange-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                    </svg>
                                                    <span className="text-sm font-medium text-orange-800">W2 Data Extraction Failed</span>
                                                  </div>
                                                  <p className="text-xs text-orange-700 mb-2">
                                                    Our system couldn't automatically read the W2 data. Manual review is required.
                                                  </p>
                                                  <div className="text-xs text-orange-600">
                                                    <strong>Next step:</strong> Click "Finalize Income" to manually enter the W2 information.
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    
                                    {/* Resident Income Summary */}
                                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                      <h5 className="text-sm font-medium text-blue-800 mb-2">Calculated Annual Income</h5>
                                      <div className="grid grid-cols-2 gap-3 text-sm">
                                                                                 {/* Income calculation is now handled at the resident level */}
                                        <div className="col-span-2 pt-2 border-t border-blue-200">
                                          <span className="text-gray-700">Total Verified Income:</span>
                                          <div className="font-bold text-lg">
                                            {isResidentFinalized 
                                              ? <span className="text-blue-700">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(residentVerifiedIncome)}</span>
                                              : <span className="text-gray-400">Not Finalized</span>
                                            }
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Resident Actions */}
                              <div className="ml-4 flex flex-col space-y-2">
                                {/* Upload Documents button for each resident */}
                                {isInProgress && !isResidentFinalized && !resident.hasNoIncome && (
                                  <button
                                    onClick={() => {
                                      setUploadDialogData({
                                        verificationId: verification.id,
                                        leaseName: period.name,
                                        residents: [{ id: resident.id, name: resident.name }], // Only this resident
                                        hasExistingDocuments: !!verification.incomeDocuments?.some(d => d.residentId === resident.id)
                                      });
                                      setUploadDialogOpen(true);
                                    }}
                                    className="flex items-center justify-center px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                    title={`Upload income documents for ${resident.name}`}
                                  >
                                    📄 Upload Documents
                                  </button>
                                )}
                                
                                {/* No Income option for each resident */}
                                {isInProgress && !isResidentFinalized && !resident.hasNoIncome && !hasAnyDocuments && (
                                  <button
                                    onClick={() => handleMarkNoIncome(period.id, verification.id, resident.id, resident.name)}
                                    className="flex items-center justify-center px-3 py-1 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                                    title={`Mark ${resident.name} as having no income`}
                                  >
                                    ❌ No Income
                                  </button>
                                )}
                                
                                {/* Finalize button */}
                                {!isResidentFinalized && canFinalizeResident && (
                                  <button
                                    onClick={() => handleOpenResidentFinalizationDialog(verification!, resident, period.name)}
                                    className="flex items-center justify-center px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                                    title={`Finalize income verification for ${resident.name}`}
                                  >
                                    ✅ Finalize Income
                                  </button>
                                )}
                                {isResidentFinalized && (
                                  <div className="flex items-center space-x-2">
                                    <div className="flex items-center justify-center px-3 py-1 text-sm bg-green-100 text-green-800 rounded-md border border-green-200">
                                      <span className="font-medium">Finalized ✓</span>
                                      {resident.finalizedAt && (
                                        <span className="ml-2 text-xs text-green-600">
                                          {format(new Date(resident.finalizedAt), 'MMM d')}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => handleOpenResidentFinalizationDialog(verification!, resident, period.name)}
                                      className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-300 hover:border-blue-400 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors duration-200"
                                      title={`Modify income verification for ${resident.name}`}
                                    >
                                      Modify
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-6 py-4 text-center text-gray-500">
                      No residents added to this lease yet.
                    </div>
                  )}

                  {/* AMI Qualification for completed provisional leases */}
                  {period.status === 'completed' && period.isProvisional && period.amiBucketInfo && (
                    <div className="bg-gray-50 px-6 py-3 border-t">
                      <div className="text-sm">
                        <span className="font-medium text-gray-700">AMI Qualification: </span>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          period.amiBucketInfo.actualBucket === '50% AMI' ? 'bg-green-100 text-green-800' :
                          period.amiBucketInfo.actualBucket === '60% AMI' ? 'bg-blue-100 text-blue-800' :
                          period.amiBucketInfo.actualBucket === '80% AMI' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {period.amiBucketInfo.actualBucket}
                        </span>
                        <span className="ml-2 text-gray-500">
                          ({period.amiBucketInfo.amiPercentage?.toFixed(1)}% AMI, {period.amiBucketInfo.householdSize} {period.amiBucketInfo.householdSize === 1 ? 'person' : 'people'})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        )}

        {/* The upload form is now rendered within the table for the corresponding lease period. */}
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

      {/* Resident Finalization Dialog */}
      {residentFinalizationDialog.verification && residentFinalizationDialog.resident && (
        <ResidentFinalizationDialog
          isOpen={residentFinalizationDialog.isOpen}
          onClose={handleCloseResidentFinalizationDialog}
          onConfirm={handleFinalizeResidentVerification}
          verification={residentFinalizationDialog.verification}
          resident={residentFinalizationDialog.resident as any}
          leaseName={residentFinalizationDialog.leaseName}
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
          onClose={() => {
            setInitialAddResidentDialogOpen(false);
            resetNewLeaseWorkflow();
          }}
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
          onClose={() => {
            setAddResidentDialogOpen(false);
            resetNewLeaseWorkflow();
          }}
          onSubmit={handleAddResident}
          leaseName={selectedLeaseForResident.name}
        />
      )}
      {selectedLeaseForResident && (
        <RenewalDialog
          isOpen={isRenewalDialogOpen}
          onClose={() => {
            setRenewalDialogOpen(false);
            resetNewLeaseWorkflow();
          }}
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

      {/* Resident Selection Dialog */}
      {residentSelectionDialog.isOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Select Resident for Income Verification
                </h3>
                <button
                  onClick={handleCloseResidentSelection}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Choose which resident you'd like to upload income documents for in <strong>{residentSelectionDialog.leaseName}</strong>:
              </p>
              
              <div className="space-y-2">
                {residentSelectionDialog.residents.map((resident) => (
                  <button
                    key={resident.id}
                    onClick={() => handleResidentSelected(resident.id)}
                    className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <div className="flex items-center">
                      <span className="text-blue-600">👤</span>
                      <span className="ml-3 font-medium text-gray-900">{resident.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
