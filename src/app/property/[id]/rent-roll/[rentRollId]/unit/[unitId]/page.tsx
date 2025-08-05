'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, Fragment, useCallback, useMemo } from 'react';
import Link from 'next/link';
import IncomeVerificationDocumentUploadForm from '@/components/IncomeVerificationDocumentUploadForm';
import IncomeVerificationUploadDialog from '@/components/IncomeVerificationUploadDialog';
import VerificationFinalizationDialog from '@/components/VerificationFinalizationDialog';
import CreateLeaseDialog from '@/components/CreateLeaseDialog';
import AddResidentDialog from '@/components/AddResidentDialog';
import RenewalDialog from '@/components/RenewalDialog';
import InitialAddResidentDialog from '@/components/InitialAddResidentDialog';
import ResidentFinalizationDialog from '@/components/ResidentFinalizationDialog';

import VerificationConflictModal from '@/components/VerificationConflictModal';
import LeaseDiscrepancyResolutionModal from '@/components/LeaseDiscrepancyResolutionModal';
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
  OverrideRequest?: Array<{
    id: string;
    status: string;
    type: string;
    adminNotes?: string;
    userExplanation?: string;
    createdAt: string;
  }>;
}

interface IncomeVerification {
  id: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  finalizedAt?: string | null;
  calculatedVerifiedIncome: number | null;
  IncomeDocument: IncomeDocument[];
  incomeDocuments: IncomeDocument[]; // Add for compatibility with VerificationFinalizationDialog
  OverrideRequest?: Array<{
    id: string;
    status: string;
    type: string;
    adminNotes?: string;
    userExplanation?: string;
    residentId?: string;
    createdAt: string;
  }>;
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
  finalizedAt?: string; // Add finalizedAt field (compatible with ResidentFinalizationDialog)
  hasNoIncome?: boolean; // Add hasNoIncome field
}

interface Unit {
  id: string;
  unitNumber: string;
  squareFootage: number | null;
  bedroomCount: number | null;
  Lease: Lease[];
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
  Resident: Resident[];
  IncomeVerification: IncomeVerification[];
  Tenancy?: { id: string; rentRollId: string; unitId: string; date: string }; // Added Tenancy property
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
    return lease.Resident.find(r => r.id === residentId)?.name || 'Unknown Resident';
  };

  // Check if any residents in the lease have finalized income
  const hasAnyFinalizedResidents = lease.Resident.some(resident => resident.incomeFinalized);

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
      
      {verification.IncomeDocument.length > 0 ? (
        <ul className="space-y-3">
          {verification.IncomeDocument.map((doc) => (
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
                    <p><strong>Pay Period:</strong> {format(new Date(doc.payPeriodStartDate), 'MMM d, yyyy')} - {format(new Date(doc.payPeriodEndDate), 'MMM d, yyyy')}</p>
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
    lease?: {
      id: string;
      name: string;
      leaseStartDate?: string;
      leaseEndDate?: string;
    };
  } | null>(null);

  // Income discrepancy resolution state
  // Income discrepancy modal state - REMOVED (replaced with leaseDiscrepancyModal)

  // Lease-level income discrepancy resolution state (for multiple residents with discrepancies)
  const [leaseDiscrepancyModal, setLeaseDiscrepancyModal] = useState<{
    isOpen: boolean;
    lease: Lease | null;
    verification: IncomeVerification | null;
    residentsWithDiscrepancies: Resident[];
  }>({ isOpen: false, lease: null, verification: null, residentsWithDiscrepancies: [] });

  // Prevent modal from reopening immediately after closing (anti-loop mechanism)
  const [discrepancyModalCooldown, setDiscrepancyModalCooldown] = useState(false);

  // Verification conflict modal state
  const [verificationConflictModal, setVerificationConflictModal] = useState<{
    isOpen: boolean;
    unitNumber: string;
    existingVerificationId: string | null;
    newLeaseId: string;
  }>({ isOpen: false, unitNumber: '', existingVerificationId: null, newLeaseId: '' });

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

  // Handler for modifying (unfinalizing) a resident's income
  const handleModifyResident = async (leaseId: string, verificationId: string, residentId: string, residentName: string) => {
    if (!window.confirm(`Unfinalize ${residentName}'s income? This will allow you to modify their income verification.`)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/leases/${leaseId}/verifications/${verificationId}/residents/${residentId}/unfinalize`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to unfinalize resident income');
      }

      // Refresh the data
      fetchTenancyData(false);
      fetchUnitVerificationStatus();
    } catch (error) {
      console.error('Error unfinalizing resident income:', error);
      alert(error instanceof Error ? error.message : 'Failed to unfinalize resident income');
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
      hasExistingDocuments: false,
      lease: undefined
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

  // Simplified verification creation (now only used internally by Upload Documents buttons)
  const handleStartVerification = async (leaseId: string, overrideResidents?: Array<{ id: string; name: string }>) => {
    if (!tenancyData) return;
    
    const lease = tenancyData.unit.Lease.find(l => l.id === leaseId);
    
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
            hasExistingDocuments: false,
            lease: lease ? {
              id: lease.id,
              name: lease.name,
              leaseStartDate: lease.leaseStartDate,
              leaseEndDate: lease.leaseEndDate
            } : undefined
          });
          setUploadDialogOpen(true);
          fetchTenancyData(false); // Refresh data in background
        } else {
          // Refresh data and then open resident selection dialog  
          await fetchTenancyData(false);
          
          // Use setTimeout to ensure React state has updated after fetchTenancyData
          setTimeout(() => {
            const currentLease = tenancyData?.unit.Lease.find(l => l.id === leaseId);
            const residents = currentLease?.Resident.map(r => ({ id: r.id, name: r.name })) || [];
            
            setResidentSelectionDialog({
              isOpen: true,
              verificationId: newVerification.id,
              leaseName: currentLease?.name || 'Unknown Lease',
              residents: residents
            });
          }, 100); // Small delay to ensure state update
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
        
        // Check if this is the verification conflict error
        if (errorMessage.includes('Another verification is already in progress')) {
          // Find the existing verification for this unit
          const unitNumber = tenancyData?.unit.unitNumber || '';
          let existingVerificationId = null;
          
          // Look through all leases in the unit to find the in-progress verification
          for (const lease of tenancyData?.unit.Lease || []) {
            const inProgressVerification = lease.IncomeVerification?.find(v => v.status === 'IN_PROGRESS');
            if (inProgressVerification) {
              existingVerificationId = inProgressVerification.id;
              break;
            }
          }
          
          setVerificationConflictModal({
            isOpen: true,
            unitNumber,
            existingVerificationId,
            newLeaseId: leaseId
          });
        } else {
          alert(`Error: ${errorMessage}`);
        }
    }
  };

  const handleOpenFinalizationDialog = (verification: IncomeVerification) => {
    setFinalizationDialog({ isOpen: true, verification });
  };

  const handleCloseFinalizationDialog = () => {
    setFinalizationDialog({ isOpen: false, verification: null });
  };

  const handleCancelExistingVerification = async () => {
    if (!verificationConflictModal.existingVerificationId) {
      toast.error('No existing verification found to cancel');
      return;
    }

    try {
      // Find the lease that contains the existing verification
      let existingLeaseId = null;
      for (const lease of tenancyData?.unit.Lease || []) {
        const verification = lease.IncomeVerification?.find(v => v.id === verificationConflictModal.existingVerificationId);
        if (verification) {
          existingLeaseId = lease.id;
          break;
        }
      }

      if (!existingLeaseId) {
        throw new Error('Could not find lease for existing verification');
      }

      const response = await fetch(`/api/leases/${existingLeaseId}/verifications/${verificationConflictModal.existingVerificationId}/cancel`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel existing verification');
      }

      toast.success('Existing verification cancelled successfully');
      
      // Close the modal
      setVerificationConflictModal({ isOpen: false, unitNumber: '', existingVerificationId: null, newLeaseId: '' });
      
      // Refresh data
      await fetchTenancyData(false);
      
      // Now try to start the new verification
      setTimeout(() => {
        handleStartVerification(verificationConflictModal.newLeaseId);
      }, 100);
      
    } catch (error) {
      console.error('Error cancelling verification:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to cancel verification');
    }
  };

  const handleCloseVerificationConflictModal = () => {
    setVerificationConflictModal({ isOpen: false, unitNumber: '', existingVerificationId: null, newLeaseId: '' });
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

  // Initial data fetch with stable dependencies  
  useEffect(() => {
    fetchTenancyData();
  }, [propertyId, rentRollId, unitId]); // Only re-fetch when URL params change

  // Call fetchUnitVerificationStatus when tenancyData is available (optimized to prevent loops)
  useEffect(() => {
    if (tenancyData) {
      fetchUnitVerificationStatus();
    }
  }, [tenancyData?.unit?.id]); // Only re-run if we get a different unit

  // Track processing document count to prevent unnecessary polling
  const processingDocCount = useMemo(() => {
    if (!tenancyData) return 0;
    return tenancyData.lease.IncomeVerification.reduce((count, v) => 
      count + v.IncomeDocument.filter(d => d.status === 'PROCESSING').length, 0
    );
  }, [tenancyData]);

  // DEBUG: Log all document statuses for troubleshooting
  useEffect(() => {
    if (tenancyData) {
      const allDocuments = tenancyData.lease.IncomeVerification.flatMap(v => v.IncomeDocument);
      const statusCounts = allDocuments.reduce((acc, doc) => {
        acc[doc.status] = (acc[doc.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('[DEBUG] All document statuses:', statusCounts);
      
      // Log PROCESSING documents specifically
      const processingDocs = allDocuments.filter(d => d.status === 'PROCESSING');
      if (processingDocs.length > 0) {
        console.log('[DEBUG] PROCESSING documents:', processingDocs.map(d => ({id: d.id, type: d.documentType, uploadDate: d.uploadDate})));
      }
    }
  }, [tenancyData]);

  // Optimized polling - only poll when there are actually processing documents
  useEffect(() => {
    console.log('[POLLING] Processing document count:', processingDocCount);

    if (processingDocCount > 0) {
      console.log('[POLLING] ⚠️  Starting 5-second polling for', processingDocCount, 'PROCESSING documents');
      
      let pollCount = 0;
      const maxPolls = 60; // 5 minutes max (60 * 5 seconds = 300 seconds)
      
      const interval = setInterval(async () => {
        pollCount++;
        console.log('[POLLING] 🔄 Fetching updated data... (auto-polling active, attempt', pollCount, '/', maxPolls, ')');
        
        // If we've been polling for too long, clean up stuck documents
        if (pollCount >= maxPolls) {
          console.log('[POLLING] ⚠️  Polling timeout reached - attempting to fix stuck documents');
          
          try {
            // Call cleanup API to fix stuck documents
            const cleanupResponse = await fetch('/api/admin/cleanup-stuck-documents', { method: 'POST' });
            if (cleanupResponse.ok) {
              console.log('[POLLING] ✅ Stuck documents cleanup completed');
            }
          } catch (cleanupError) {
            console.error('[POLLING] ❌ Failed to cleanup stuck documents:', cleanupError);
          }
          
          clearInterval(interval);
          return;
        }
        
        fetchTenancyData(false);
      }, 5000);
      
      return () => {
        console.log('[POLLING] ✅ Cleaning up polling interval');
        clearInterval(interval);
      };
    } else {
      console.log('[POLLING] ✅ No processing documents - polling disabled');
    }
  }, [processingDocCount]); // Only re-run when processing count changes

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

  // Income discrepancy detection and resolution functions (UPDATED to use new individual resident modal)
  const checkForIncomeDiscrepancy = useCallback(() => {
    if (!tenancyData || discrepancyModalCooldown) return;

    // Check each lease for income discrepancies using the new individual resident approach
    tenancyData.unit.Lease.forEach(lease => {
      const verification = lease.IncomeVerification.find(v => v.status === 'IN_PROGRESS') || 
                         lease.IncomeVerification.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      if (!verification) return;

      // Check if all residents are finalized
      const allResidents = lease.Resident;
      const finalizedResidents = allResidents.filter(resident => resident.incomeFinalized);
      const allResidentsFinalized = allResidents.length > 0 && finalizedResidents.length === allResidents.length;

      // Only show discrepancy modal if all residents are finalized and there are individual discrepancies
      if (allResidentsFinalized && verification.status === 'FINALIZED') {
        const residentsWithDiscrepancies = allResidents.filter(resident => {
          const rentRollIncome = resident.annualizedIncome || 0;
          const verifiedIncome = resident.calculatedAnnualizedIncome || 0;
          const discrepancy = Math.abs(rentRollIncome - verifiedIncome);
          return discrepancy > 1.00; // More than $1 difference
        });

        if (residentsWithDiscrepancies.length > 0) {
          console.log(`[INDIVIDUAL DISCREPANCY DETECTED] Lease ${lease.id}: ${residentsWithDiscrepancies.length} residents with discrepancies`);
          
          // Use the NEW individual resident modal instead of the old unit-level modal
          setLeaseDiscrepancyModal({
            isOpen: true,
            lease: lease,
            verification: verification ? {
              ...verification,
              incomeDocuments: verification.IncomeDocument || []
            } : null,
            residentsWithDiscrepancies: residentsWithDiscrepancies
          });
        }
      }
    });
  }, [tenancyData, discrepancyModalCooldown]);

  // Run discrepancy check when tenancy data changes
  useEffect(() => {
    checkForIncomeDiscrepancy();
  }, [checkForIncomeDiscrepancy]);

  // Handler functions for discrepancy resolution modal - REMOVED (replaced with new individual resident modal handlers)

  // New function to create lease periods based on tenancy data
  const createLeasePeriods = () => {
    if (!tenancyData) return [];
    
    // TODO: Implement rent roll reconciliation logic.
    // This function currently displays all leases for a unit. In the future, we will need to
    // implement a mechanism to match provisional leases with new tenancies from rent roll uploads.
    // This could involve a UI where the user can select a provisional lease to link to a new tenancy.

    return tenancyData.unit.Lease.map(lease => {
      const leaseStart = lease.leaseStartDate ? new Date(lease.leaseStartDate) : null;
      const leaseEnd = lease.leaseEndDate ? new Date(lease.leaseEndDate) : null;
      const currentDate = new Date();

      const verification = lease.IncomeVerification.find(v => v.status === 'IN_PROGRESS') || lease.IncomeVerification.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      const status = getPeriodStatus({ verification });

      const isProvisional = !lease.Tenancy;
      
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
        isProvisional: !lease.Tenancy,
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



  // Call the function to get lease periods
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
              // But first check for pending validation exception override requests
              let currentVerificationStatus: string;
              if (verification?.status === 'IN_PROGRESS') {
                // Check if there are pending validation exception override requests
                const hasPendingValidationException = verification.OverrideRequest?.some(
                  (request: any) => request.type === 'VALIDATION_EXCEPTION' && 
                                   request.status === 'PENDING'
                );
                
                currentVerificationStatus = hasPendingValidationException 
                  ? 'Waiting for Admin Review' 
                  : 'In Progress - Finalize to Process';
              } else {
                currentVerificationStatus = unitVerificationStatus;
              }
                
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
                          {period.Resident.length} {period.Resident.length === 1 ? 'resident' : 'residents'}
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
                              case 'Waiting for Admin Review':
                                return (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                                    ⏳ Waiting for Admin Review
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
                              // Check if ALL residents are finalized (not just some)
                              const allResidents = period.Resident;
                              const finalizedResidents = allResidents.filter(resident => resident.incomeFinalized);
                              const allResidentsFinalized = allResidents.length > 0 && finalizedResidents.length === allResidents.length;
                              
                              if (!allResidentsFinalized) {
                                return <span className="text-gray-400">Not Finalized</span>;
                              }
                              
                              // Calculate verified income only when all residents are finalized
                              const leaseVerifiedIncome = finalizedResidents.reduce((total, resident) => {
                                return total + (resident.calculatedAnnualizedIncome || 0);
                              }, 0);
                              
                              return leaseVerifiedIncome > 0 
                                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(leaseVerifiedIncome)
                                : <span className="text-gray-400">$0.00</span>;
                            })()}
                          </p>
                        </div>
                        
                        {/* Lease Actions */}
                        <div className="flex flex-col space-y-1">
                          {/* Removed redundant "Verify Lease Income" button - Upload Documents buttons now auto-create verification */}

                          {/* Lease-Level Finalize Income Button - Show when all residents finalized but status is "Needs Investigation" */}
                          {(() => {
                            const allResidents = period.Resident;
                            const finalizedResidents = allResidents.filter(resident => resident.incomeFinalized);
                            const allResidentsFinalized = allResidents.length > 0 && finalizedResidents.length === allResidents.length;
                            const hasIncomeDiscrepancy = currentVerificationStatus === 'Needs Investigation';
                            
                            if (allResidentsFinalized && hasIncomeDiscrepancy && !discrepancyModalCooldown) {
                              // Skip lease discrepancy modal for future leases (no rent roll data)
                              const totalRentRollIncome = allResidents.reduce((sum, resident) => sum + (resident.annualizedIncome || 0), 0);
                              const isFutureLease = totalRentRollIncome === 0;
                              
                              if (isFutureLease) {
                                // Future lease - skip discrepancy check
                                return null;
                              }
                              
                              // Find residents with income discrepancies (rent roll vs verified income)
                              const residentsWithDiscrepancies = allResidents.filter(resident => {
                                const rentRollIncome = resident.annualizedIncome || 0;
                                const verifiedIncome = resident.calculatedAnnualizedIncome || 0;
                                const discrepancy = Math.abs(rentRollIncome - verifiedIncome);
                                return discrepancy > 1.00; // More than $1 difference
                              });
                              
                              if (residentsWithDiscrepancies.length > 0) {
                                return (
                                  <button 
                                    onClick={() => setLeaseDiscrepancyModal({
                                      isOpen: true,
                                      lease: period,
                                      verification: verification ? {
                                        ...verification,
                                        incomeDocuments: verification.IncomeDocument || []
                                      } : null,
                                      residentsWithDiscrepancies: residentsWithDiscrepancies
                                    })}
                                    className="text-sm font-semibold text-white bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
                                  >
                                    💰 Finalize Income ({residentsWithDiscrepancies.length} {residentsWithDiscrepancies.length === 1 ? 'resident' : 'residents'})
                                  </button>
                                );
                              } else if (discrepancyModalCooldown) {
                                return (
                                  <div className="text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-md">
                                    ✅ Processing changes...
                                  </div>
                                );
                              }
                            }
                            return null;
                          })()}

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
                  {period.Resident.length > 0 ? (
                    <div className="divide-y divide-gray-200">
                      {period.Resident.map((resident) => {
                        // Filter documents for this resident - ONLY FOR THIS SPECIFIC VERIFICATION
                        const residentDocuments = verification?.IncomeDocument?.filter(
                          doc => doc.residentId === resident.id
                        ) || [];
                        
                        // Calculate completed documents (status COMPLETED, regardless of calculated income)
                        const completedResidentDocuments = residentDocuments.filter(
                          doc => doc.status === 'COMPLETED'
                        );
                        
                        // Calculate resident verified income from their actual completed documents
                        let residentVerifiedIncome = 0;
                        if (completedResidentDocuments.length > 0) {
                          // Calculate total annualized income from completed documents
                          residentVerifiedIncome = completedResidentDocuments.reduce((total, doc) => {
                            if (doc.documentType === 'W2') {
                              // For W2, use the highest of boxes 1, 3, 5
                              const amounts = [doc.box1_wages, doc.box3_ss_wages, doc.box5_med_wages]
                                .filter((amount): amount is number => amount !== null && amount !== undefined);
                              return total + (amounts.length > 0 ? Math.max(...amounts) : 0);
                            }
                            return total;
                          }, 0);
                          
                          // Handle paystubs separately - average then annualize
                          const paystubDocuments = completedResidentDocuments.filter(doc => doc.documentType === 'PAYSTUB');
                          if (paystubDocuments.length > 0) {
                            const totalGrossPay = paystubDocuments.reduce((sum, doc) => sum + (Number(doc.grossPayAmount) || 0), 0);
                            const averageGrossPay = totalGrossPay / paystubDocuments.length;
                            
                            // For paystubs, annualize based on pay frequency (use database format with hyphens)
                            const payFrequency = paystubDocuments[0]?.payFrequency || 'BI-WEEKLY';
                            const multiplier = payFrequency === 'WEEKLY' ? 52 : 
                                             payFrequency === 'BI-WEEKLY' ? 26 : 
                                             payFrequency === 'SEMI-MONTHLY' ? 24 : 
                                             payFrequency === 'MONTHLY' ? 12 : 26; // Default to bi-weekly
                            residentVerifiedIncome += (averageGrossPay * multiplier);
                          }
                        } else {
                          // Fallback to resident-level calculated income or 0
                          residentVerifiedIncome = resident.calculatedAnnualizedIncome || 0;
                        }

                        const isResidentFinalized = resident.incomeFinalized || false;
                        const hasCompletedDocuments = completedResidentDocuments.length > 0;
                        
                        // Show documents if ANY documents exist (not just completed ones with calculated income)
                        const hasAnyDocuments = residentDocuments.length > 0;
                        
                        // Button visibility logic based on resident state
                        // Check if there are any documents still pending admin review
                        const hasPendingDocuments = residentDocuments.some(doc => {
                          if (doc.status !== 'NEEDS_REVIEW') return false;
                          const latestOverrideRequest = doc.OverrideRequest?.[0]; // Most recent
                          const hasPendingRequest = latestOverrideRequest?.status === 'PENDING';
                          return hasPendingRequest; // True if document is pending admin review
                        });
                        
                        // Check if there are any denied documents that need to be replaced
                        const hasDeniedDocuments = residentDocuments.some(doc => {
                          if (doc.status !== 'NEEDS_REVIEW') return false;
                          const latestOverrideRequest = doc.OverrideRequest?.[0]; // Most recent
                          const isDenied = latestOverrideRequest?.status === 'DENIED';
                          return isDenied; // True if document was denied by admin
                        });
                        
                        // Only allow finalization if we have documents and none are pending/denied admin review
                        const hasAnyValidDocuments = hasCompletedDocuments && !hasPendingDocuments && !hasDeniedDocuments;
                        
                        // Check if there are pending validation exception override requests for this resident
                        const hasPendingValidationException = verification?.OverrideRequest?.some(
                          (request: any) => request.type === 'VALIDATION_EXCEPTION' && 
                                   request.residentId === resident.id &&
                                   request.status === 'PENDING'
                        ) || false;
                        
                        // Button conditions:
                        // - Upload Documents: Always show when not finalized
                        // - No Income: Only show when NO documents exist at all AND not finalized  
                        // - Finalize Income: Only show when has valid documents AND not finalized AND no pending validation exception
                        const showUploadButton = !isResidentFinalized;
                        const showNoIncomeButton = !hasAnyDocuments && !isResidentFinalized;
                        const showFinalizeButton = hasAnyValidDocuments && !isResidentFinalized && !hasPendingValidationException;
                        


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
                                    ) : hasPendingValidationException ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                        ⏳ Waiting for Admin Review
                                      </span>
                                    ) : hasPendingDocuments ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                        ⏳ Waiting for Admin Review
                                      </span>
                                    ) : hasDeniedDocuments ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        ❌ Document Denied
                                      </span>
                                    ) : hasCompletedDocuments && residentVerifiedIncome > 0 ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                        📋 Ready to Finalize
                                      </span>
                                    ) : hasCompletedDocuments && residentVerifiedIncome === 0 ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                        ⚠️ Income Calculation Error
                                      </span>
                                    ) : hasAnyDocuments ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        📄 Documents Processing
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

                                {/* Show explanation for why admin review is needed */}
                                {hasPendingValidationException && (() => {
                                  const pendingRequest = verification?.OverrideRequest?.find(
                                    (request: any) => request.type === 'VALIDATION_EXCEPTION' && 
                                             request.residentId === resident.id &&
                                             request.status === 'PENDING'
                                  );
                                  if (pendingRequest?.userExplanation) {
                                    return (
                                      <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
                                        <div className="flex items-start space-x-2">
                                          <div className="flex-shrink-0 mt-0.5">
                                            <span className="text-orange-500">ℹ️</span>
                                          </div>
                                          <div className="flex-1">
                                            <p className="text-xs font-medium text-orange-800 mb-1">
                                              Reason for Admin Review:
                                            </p>
                                            <p className="text-xs text-orange-700">
                                              {pendingRequest.userExplanation}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                                
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
                                      {residentDocuments.map(doc => {
                                        // Check override request status to determine document state
                                        const latestOverrideRequest = doc.OverrideRequest?.[0]; // Most recent (due to orderBy createdAt desc)
                                        const hasPendingRequest = latestOverrideRequest?.status === 'PENDING';
                                        const isDenied = latestOverrideRequest?.status === 'DENIED';
                                        const isApproved = latestOverrideRequest?.status === 'APPROVED' || doc.status === 'COMPLETED';
                                        
                                        const needsReview = doc.status === 'NEEDS_REVIEW' && hasPendingRequest;
                                        
                                        // Determine UI styling based on document status
                                        let containerClasses, badgeClasses, statusText, statusIcon;
                                        
                                        if (isDenied) {
                                          containerClasses = "p-3 bg-red-50 border border-red-200 rounded-md";
                                          badgeClasses = "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800";
                                          statusText = "Denied by Admin";
                                          statusIcon = "❌";
                                        } else if (needsReview) {
                                          containerClasses = "p-3 bg-yellow-50 border border-yellow-200 rounded-md";
                                          badgeClasses = "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800";
                                          statusText = "Waiting for Admin Review";
                                          statusIcon = "⚠️";
                                        } else if (isApproved) {
                                          containerClasses = "p-3 bg-green-50 border border-green-200 rounded-md";
                                          badgeClasses = "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800";
                                          statusText = "Approved";
                                          statusIcon = "✅";
                                        } else {
                                          // Default/neutral state
                                          containerClasses = "p-3 bg-gray-50 border border-gray-200 rounded-md";
                                          badgeClasses = "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800";
                                          statusText = "Processing";
                                          statusIcon = "⏳";
                                        }
                                        
                                        return (
                                          <div key={doc.id} className={containerClasses}>
                                          {(needsReview || isDenied) && (
                                            <div className={`mb-2 text-xs font-medium flex items-center ${
                                              isDenied ? 'text-red-700' : 'text-yellow-700'
                                            }`}>
                                              <span className="mr-1">{statusIcon}</span>
                                              {statusText}
                                            </div>
                                          )}
                                          
                                          {isDenied && latestOverrideRequest?.adminNotes && (
                                            <div className="mb-2 p-2 bg-red-100 border border-red-200 rounded text-xs">
                                              <div className="font-medium text-red-800 mb-1">Admin Reason:</div>
                                              <div className="text-red-700">{latestOverrideRequest.adminNotes}</div>
                                              <div className="mt-2 text-red-800 font-medium">
                                                📋 Action Required: Delete this document, upload correct documents, and re-finalize resident income.
                                              </div>
                                            </div>
                                          )}
                                          
                                          {needsReview && latestOverrideRequest?.userExplanation && (() => {
                                            const explanation = latestOverrideRequest.userExplanation;
                                            // Skip Azure-specific technical explanations since user-friendly message already shows
                                            const isAzureExplanation = explanation.includes('Azure Document Intelligence') || 
                                                                      explanation.includes('Confidence:') ||
                                                                      explanation.includes('extraction requires admin review');
                                            
                                            if (isAzureExplanation) return null;
                                            
                                            return (
                                              <div className="mb-2 p-2 bg-yellow-100 border border-yellow-200 rounded text-xs">
                                                <div className="font-medium text-yellow-800 mb-1">Reason for Review:</div>
                                                <div className="text-yellow-700">{explanation}</div>
                                              </div>
                                            );
                                          })()}
                                          <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center space-x-2">
                                              <span className={badgeClasses}>
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
                                          {doc.documentType === 'PAYSTUB' && !needsReview && (
                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                              {doc.payPeriodStartDate && doc.payPeriodEndDate && (
                                                <div>
                                                  <span className="font-medium text-gray-700">Pay Period:</span>
                                                  <div className="text-gray-600">
                                                    {format(new Date(doc.payPeriodStartDate), 'MMM d, yyyy')} - {format(new Date(doc.payPeriodEndDate), 'MMM d, yyyy')}
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
                                            </div>
                                          )}
                                          
                                          {/* Show admin review message for documents needing review */}
                                          {needsReview && (
                                            <div className="mt-2 text-xs text-yellow-700 font-medium">
                                              Status: Pending Admin Review
                                            </div>
                                          )}
                                          
                                          {doc.documentType === 'PAYSTUB' && needsReview && (
                                            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                                              This paystub could not be automatically processed and requires admin review.
                                            </div>
                                          )}
                                          
                                          {doc.documentType === 'PAYSTUB' && !needsReview && (
                                            <div className="grid grid-cols-2 gap-3 text-xs">
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
                                        );
                                      })}
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
                                {showUploadButton && (
                                  <button
                                    onClick={async () => {
                                      if (verification) {
                                        // Verification exists, use it directly
                                        setUploadDialogData({
                                          verificationId: verification.id,
                                          leaseName: period.name,
                                          residents: [{ id: resident.id, name: resident.name }], // Only this resident
                                          hasExistingDocuments: !!verification.IncomeDocument?.some(d => d.residentId === resident.id),
                                          lease: {
                                            id: period.id,
                                            name: period.name,
                                            leaseStartDate: period.leaseStartDate,
                                            leaseEndDate: period.leaseEndDate
                                          }
                                        });
                                        setUploadDialogOpen(true);
                                      } else {
                                        // No verification exists, create one first
                                        await handleStartVerification(period.id, [{ id: resident.id, name: resident.name }]);
                                      }
                                    }}
                                    className="flex items-center justify-center px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                    title={`Upload income documents for ${resident.name}`}
                                  >
                                    📄 Upload Documents
                                  </button>
                                )}
                                
                                {/* No Income option for each resident */}
                                {showNoIncomeButton && (
                                  <button
                                    onClick={async () => {
                                      if (verification) {
                                        // Verification exists, use it directly
                                        await handleMarkNoIncome(period.id, verification.id, resident.id, resident.name);
                                      } else {
                                        // No verification exists, create one first then mark no income
                                        try {
                                          const res = await fetch(`/api/leases/${period.id}/verifications`, {
                                            method: 'POST',
                                          });
                                          if (!res.ok) {
                                            const data = await res.json();
                                            throw new Error(data.error || 'Failed to start new verification');
                                          }
                                          const newVerification = await res.json();
                                          await handleMarkNoIncome(period.id, newVerification.id, resident.id, resident.name);
                                        } catch (error) {
                                          console.error('Error creating verification:', error);
                                          alert('Failed to create verification. Please try again.');
                                        }
                                      }
                                    }}
                                    className="flex items-center justify-center px-3 py-1 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                                    title={`Mark ${resident.name} as having no income`}
                                  >
                                    ❌ No Income
                                  </button>
                                )}
                                
                                {/* Finalize button */}
                                {showFinalizeButton && (
                                  <button
                                    onClick={() => {
                                      setResidentFinalizationDialog({
                                        isOpen: true,
                                        verification: verification!,
                                        resident: resident,
                                        leaseName: period.name
                                      });
                                    }}
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
                                      onClick={() => handleModifyResident(period.id, verification!.id, resident.id, resident.name)}
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
          residents={tenancyData?.unit.Lease.find(l => l.id === finalizationDialog.verification?.leaseId)?.Resident || []}
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

      {/* OLD Income Discrepancy Resolution Modal - REMOVED, replaced with new individual resident modal */}

            {/* Verification Conflict Modal */}
      <VerificationConflictModal
        isOpen={verificationConflictModal.isOpen}
        onClose={handleCloseVerificationConflictModal}
        onCancel={handleCancelExistingVerification}
        unitNumber={formatUnitNumber(verificationConflictModal.unitNumber)}
      />

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
            tenancyData.unit.Lease.find(l => l.Tenancy && l.leaseStartDate)
              ?.Resident || []
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
          allCurrentLeaseResidents={
            tenancyData?.unit.Lease.find(l => l.Tenancy && l.leaseStartDate)
              ?.Resident || []
          }
          hasExistingDocuments={uploadDialogData.hasExistingDocuments}
          leaseName={uploadDialogData.leaseName}
          unitId={unitId as string}
          propertyId={propertyId as string}
          rentRollId={rentRollId as string}
          currentLease={uploadDialogData.lease}
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

      {/* Resident Finalization Dialog */}
      {residentFinalizationDialog.isOpen && residentFinalizationDialog.verification && residentFinalizationDialog.resident && (
        <ResidentFinalizationDialog
          isOpen={residentFinalizationDialog.isOpen}
          onClose={() => setResidentFinalizationDialog({ isOpen: false, verification: null, resident: null, leaseName: '' })}
          onConfirm={async (calculatedIncome: number) => {
            if (!residentFinalizationDialog.verification || !residentFinalizationDialog.resident) return;
            
            try {
              const response = await fetch(
                `/api/leases/${residentFinalizationDialog.verification.leaseId}/verifications/${residentFinalizationDialog.verification.id}/residents/${residentFinalizationDialog.resident.id}/finalize`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ calculatedIncome })
                }
              );

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to finalize resident income');
              }

              // Refresh the data
              fetchTenancyData(false);
              fetchUnitVerificationStatus();
              
              // Close the dialog
              setResidentFinalizationDialog({ isOpen: false, verification: null, resident: null, leaseName: '' });
            } catch (error) {
              console.error('Error finalizing resident income:', error);
              alert(error instanceof Error ? error.message : 'Failed to finalize resident income');
            }
          }}
          verification={residentFinalizationDialog.verification}
          resident={residentFinalizationDialog.resident}
          leaseName={residentFinalizationDialog.leaseName}
          onDataRefresh={() => fetchTenancyData(false)} // Pass the refresh callback
        />
      )}

      {/* Lease-Level Discrepancy Resolution Modal */}
      {leaseDiscrepancyModal.isOpen && leaseDiscrepancyModal.lease && leaseDiscrepancyModal.verification && (
        <LeaseDiscrepancyResolutionModal
          isOpen={leaseDiscrepancyModal.isOpen}
          onClose={() => {
            setLeaseDiscrepancyModal({ isOpen: false, lease: null, verification: null, residentsWithDiscrepancies: [] });
            // Brief cooldown when manually closed to prevent immediate reopening
            setDiscrepancyModalCooldown(true);
            setTimeout(() => setDiscrepancyModalCooldown(false), 1000);
          }}
          lease={leaseDiscrepancyModal.lease}
          verification={leaseDiscrepancyModal.verification}
          residentsWithDiscrepancies={leaseDiscrepancyModal.residentsWithDiscrepancies}
          onResolved={() => {
            // Start cooldown to prevent immediate reopening
            setDiscrepancyModalCooldown(true);
            
            // Refresh data after resolving discrepancies
            fetchTenancyData(false);
            fetchUnitVerificationStatus();
            
            // Clear cooldown after data has time to refresh
            setTimeout(() => {
              setDiscrepancyModalCooldown(false);
            }, 2000); // 2 second cooldown
          }}
        />
      )}
      </div>
    </div>
  );
}
