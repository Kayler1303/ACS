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
import BackToPropertyLink from '@/components/BackToPropertyLink';

import VerificationConflictModal from '@/components/VerificationConflictModal';
import LeaseDiscrepancyResolutionModal from '@/components/LeaseDiscrepancyResolutionModal';
import { format } from 'date-fns';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getUnitVerificationStatus, type VerificationStatus } from '@/services/verification';
import OverrideRequestModal from '@/components/OverrideRequestModal';
import DeleteLeaseDialog from '@/components/DeleteLeaseDialog';

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
  uploadDate: string;
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
  id: string | null;
  lease: Lease | null;
  unit: Unit;
  rentRoll: RentRoll | null;
  isVacant?: boolean;
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

function VerificationRow({ verification, lease, onActionComplete, onOpenDocumentReview }: { verification: IncomeVerification, lease: Lease, onActionComplete: () => void, onOpenDocumentReview: (doc: any, verificationId: string, leaseName: string) => void }) {
  
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

  // These functions are defined in the main component scope
  // const openDocumentReviewModal = (defined below in main component)
  // const submitDocumentReview = (defined below in main component)

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
                  {doc.status === 'COMPLETED' && (
                    <button
                      onClick={() => onOpenDocumentReview(doc as any, verification.id, lease.name)}
                      className="text-orange-600 hover:text-orange-700 text-xs px-2 py-1 border border-orange-300 rounded"
                    >
                      Request Admin Review
                    </button>
                  )}
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
              {doc.documentType === 'SOCIAL_SECURITY' && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                  <p><strong>Beneficiary:</strong> {doc.employeeName || 'N/A'}</p>
                  {doc.documentDate && (
                    <p><strong>Letter Date:</strong> {format(new Date(doc.documentDate), 'MMM d, yyyy')}</p>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 pt-1">
                    <p><strong>Monthly Benefit:</strong> {doc.grossPayAmount ? `$${doc.grossPayAmount.toLocaleString()}` : 'N/A'}</p>
                    <p><strong>Pay Frequency:</strong> Monthly</p>
                  </div>
                  {doc.calculatedAnnualizedIncome && (
                    <p className="pt-1 font-medium text-green-700">
                      <strong>Annual Income:</strong> ${doc.calculatedAnnualizedIncome.toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              {doc.documentType === 'SSA_1099' && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                  <p><strong>Beneficiary:</strong> {doc.employeeName || 'N/A'}</p>
                  {doc.documentDate && (
                    <p><strong>Tax Year:</strong> {new Date(doc.documentDate).getFullYear()}</p>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 pt-1">
                    <p><strong>Monthly Benefit:</strong> {doc.grossPayAmount ? `$${doc.grossPayAmount.toLocaleString()}` : 'N/A'}</p>
                    <p><strong>Annual Benefits:</strong> {doc.calculatedAnnualizedIncome ? `$${doc.calculatedAnnualizedIncome.toLocaleString()}` : 'N/A'}</p>
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

   // override request modal state
  const [overrideModal, setOverrideModal] = useState<{
    isOpen: boolean;
    documentId: string | null;
    verificationId: string | null;
    residentId: string | null;
    title: string;
    description: string;
  }>({ isOpen: false, documentId: null, verificationId: null, residentId: null, title: '', description: '' });

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

  // Delete lease dialog state
  const [deleteLeaseDialog, setDeleteLeaseDialog] = useState<{
    isOpen: boolean;
    lease: {
      id: string;
      name: string;
      residentCount: number;
      hasDocuments: boolean;
    } | null;
  }>({ isOpen: false, lease: null });

  // Helper function to clean up new lease workflow state
  const resetNewLeaseWorkflow = () => {
    setIsNewLeaseWorkflow(false);
    setSelectedLeaseForResident(null);
  };

  // Handler for marking a resident as having no income
  const handleMarkNoIncome = async (leaseId: string, verificationId: string, residentId: string, residentName: string) => {
    if (!window.confirm(`Mark ${residentName} as having no income? This will set their verified income to $0.`)) {
      return;
    }

    console.log(`[NO INCOME DEBUG] Starting No Income process for ${residentName} (${residentId})`);
    console.log(`[NO INCOME DEBUG] LeaseId: ${leaseId}, VerificationId: ${verificationId}`);

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

      console.log(`[NO INCOME DEBUG] API response status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`[NO INCOME DEBUG] API error:`, errorData);
        throw new Error(errorData.error || 'Failed to mark resident as no income');
      }

      const responseData = await response.json();
      console.log(`[NO INCOME DEBUG] API success response:`, responseData);

      if (responseData.hasDiscrepancy) {
        // Show discrepancy modal - don't auto-finalize
        console.log(`[NO INCOME DEBUG] Income discrepancy detected - showing discrepancy modal`);
        alert(`Income discrepancy detected for ${residentName}. The rent roll shows $${responseData.discrepancyDetails.originalIncome} but you marked them as having no income. Please use the finalization dialog to resolve this discrepancy.`);
      } else {
        // No discrepancy - resident was auto-finalized
        console.log(`[NO INCOME DEBUG] No discrepancy - resident auto-finalized`);
      }

      // Refresh data to show updated resident status
      console.log(`[NO INCOME DEBUG] Refreshing data...`);
      await fetchTenancyData(false);
      await fetchUnitVerificationStatus();
      console.log(`[NO INCOME DEBUG] Data refresh completed`);
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

  // Delete lease handlers
  const handleDeleteFutureLease = (lease: any) => {
    // Check if this is a future lease (relative to snapshot date, not current date)
    const snapshotDate = tenancyData?.rentRoll?.uploadDate;
    const leaseStartDate = lease.leaseStartDate;
    
    const isFutureLease = 
      // No Tenancy = provisional lease (always deletable)
      !lease.Tenancy ||
      // No start date = manually created future lease without dates
      !leaseStartDate ||
      // Start date after snapshot date = future lease
      (leaseStartDate && snapshotDate && 
       new Date(leaseStartDate) > new Date(snapshotDate));

    if (!isFutureLease) {
      alert('Only future leases can be deleted. Current leases cannot be deleted.');
      return;
    }

    // Check if lease has documents
    const hasDocuments = lease.IncomeVerification?.some((v: any) => 
      v.IncomeDocument && v.IncomeDocument.length > 0
    ) || false;

    setDeleteLeaseDialog({
      isOpen: true,
      lease: {
        id: lease.id,
        name: lease.name,
        residentCount: lease.Resident?.length || 0,
        hasDocuments
      }
    });
  };

  const handleConfirmDeleteLease = async () => {
    if (!deleteLeaseDialog.lease) return;

    try {
      const response = await fetch(`/api/leases/${deleteLeaseDialog.lease.id}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete lease');
      }

      const result = await response.json();
      
      // Show success message
      toast.success(result.message || 'Lease deleted successfully');
      
      // Refresh the data
      await fetchTenancyData(false);
      await fetchUnitVerificationStatus();
      
      // Close dialog
      setDeleteLeaseDialog({ isOpen: false, lease: null });
      
    } catch (error) {
      console.error('Error deleting lease:', error);
      throw error; // Re-throw so DeleteLeaseDialog can handle it
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
      console.log(`[COPY RESIDENTS] isNewLeaseWorkflow: ${isNewLeaseWorkflow}, selectedLeaseForResident: ${selectedLeaseForResident?.id}`);
      if (isNewLeaseWorkflow && selectedLeaseForResident) {
        console.log(`[COPY RESIDENTS] Starting automatic verification workflow for lease ${selectedLeaseForResident.id}`);
        
        // Fetch fresh data to get all current residents
        await fetchTenancyData(false);
        
        // Get current residents for the lease
        const res = await fetch(`/api/properties/${propertyId}/rent-roll/${rentRollId}/unit/${unitId}`);
        const freshData = await res.json();
        const currentLease = freshData?.unit?.Lease?.find((l: any) => l.id === selectedLeaseForResident.id);
        const currentResidents = currentLease?.Resident?.map((r: any) => ({ id: r.id, name: r.name })) || [];
        
        console.log(`[COPY RESIDENTS] Found ${currentResidents.length} residents for verification:`, currentResidents);
        
        setTimeout(() => {
          console.log(`[COPY RESIDENTS] Calling handleStartVerification with lease ${selectedLeaseForResident.id}`);
          handleStartVerification(selectedLeaseForResident.id, currentResidents);
        }, 200); // Small delay to ensure everything is ready
        setIsNewLeaseWorkflow(false); // Reset the flag
      } else {
        console.log(`[COPY RESIDENTS] Not starting verification - isNewLeaseWorkflow: ${isNewLeaseWorkflow}, selectedLeaseForResident: ${!!selectedLeaseForResident}`);
        fetchTenancyData(false);
      }
    } catch (error: unknown) {
      console.error('Error adding residents:', error);
      toast.error((error instanceof Error ? error.message : 'An error occurred while adding residents.'));
      // Don't reset the workflow flag on error - let the user try again
      console.log(`[COPY RESIDENTS] Error occurred, not resetting workflow flag`);
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
    console.log(`[START VERIFICATION] Called with leaseId: ${leaseId}, overrideResidents:`, overrideResidents);
    if (!tenancyData) {
      console.log(`[START VERIFICATION] No tenancyData available, returning`);
      return;
    }
    
    let lease = tenancyData.unit?.Lease?.find(l => l.id === leaseId);
    
    // If lease is not found, refresh data first (this can happen with newly created leases)
    if (!lease) {
      console.log(`[VERIFICATION] Lease ${leaseId} not found in current data, refreshing...`);
      
      // Fetch fresh data directly instead of relying on state
      try {
        const res = await fetch(`/api/properties/${propertyId}/rent-roll/${rentRollId}/unit/${unitId}`);
        if (!res.ok) {
          throw new Error('Failed to fetch fresh unit data');
        }
        const freshData = await res.json();
        lease = freshData.unit?.Lease?.find((l: any) => l.id === leaseId);
        
        if (!lease) {
          console.error(`[VERIFICATION] Lease ${leaseId} still not found in fresh data`);
          throw new Error('Lease not found. Please refresh the page and try again.');
        }
        
        console.log(`[VERIFICATION] Found lease in fresh data: ${lease.name}`);
      } catch (error) {
        console.error(`[VERIFICATION] Error fetching fresh data:`, error);
        throw new Error('Failed to load lease data. Please refresh the page and try again.');
      }
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
            verificationId: newVerification.verificationId,
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
          
          // Add small delay to ensure database transaction is committed
          setTimeout(() => {
            setUploadDialogOpen(true);
          }, 100);
          
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
              verificationId: newVerification.verificationId,
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
      
      await refreshDataAfterFinalization();
      
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
      // Immediately recompute status after data changes
      setTimeout(() => { fetchUnitVerificationStatus(); }, 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  }, [propertyId, rentRollId, unitId]);

  // Initial data fetch with stable dependencies  
  useEffect(() => {
    fetchTenancyData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, rentRollId, unitId]); // Only re-fetch when URL params change

  // Recompute verification status whenever tenancy data changes
  useEffect(() => {
    if (tenancyData) {
      fetchUnitVerificationStatus();
    }
  }, [tenancyData]);

  // Track processing document count to prevent unnecessary polling
  const processingDocCount = useMemo(() => {
    if (!tenancyData?.lease?.IncomeVerification) return 0;
    return tenancyData.lease.IncomeVerification.reduce((count, v) => 
      count + v.IncomeDocument.filter(d => d.status === 'PROCESSING').length, 0
    );
  }, [tenancyData]);

  // DEBUG: Log all document statuses for troubleshooting
  useEffect(() => {
    if (tenancyData?.lease?.IncomeVerification) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Helper function to refresh data with proper timing after finalization actions
  const refreshDataAfterFinalization = async () => {
    console.log('[REFRESH] Starting post-finalization data refresh');
    
    // First immediate refresh
    await fetchTenancyData(false);
    
           // Add a delay for database consistency, then refresh again to ensure we have the latest data
      setTimeout(async () => {
        console.log('[REFRESH] Performing delayed refresh for accurate status');
        await fetchTenancyData(false);
        await fetchUnitVerificationStatus();
      }, 500);
  };

  // Document review modal functions
  const openDocumentReviewModal = (doc: any, verificationId: string, leaseName: string) => {
    setOverrideModal({
      isOpen: true,
      documentId: doc.id,
      verificationId,
      residentId: doc.residentId || null,
      title: 'Request Admin Review of Document',
      description: `If the automatic analysis for this ${doc.documentType} looks incorrect, you can request an admin review for ${leaseName}. Please describe the issue and the correct values if known.`
    });
  };

  const submitDocumentReview = async (explanation: string) => {
    if (!overrideModal.documentId) return;
    try {
      const res = await fetch('/api/override-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DOCUMENT_REVIEW',
          userExplanation: explanation,
          documentId: overrideModal.documentId,
          verificationId: overrideModal.verificationId,
          residentId: overrideModal.residentId
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit admin review request');
      }
      toast.success('Admin review requested');
      setOverrideModal({ isOpen: false, documentId: null, verificationId: null, residentId: null, title: '', description: '' });
      await refreshDataAfterFinalization();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to request admin review');
    }
  };

  // Function to fetch verification status for this specific lease
  const fetchUnitVerificationStatus = async () => {
    if (!tenancyData?.lease) return;
    
    try {
      // Import the verification service to calculate lease-level status
      const { getLeaseVerificationStatus } = await import('@/services/verification');
      
      // Use lease-level logic since this page shows details for a specific lease
      const lease = tenancyData.lease;
      console.log(`[LEASE STATUS] Calculating status for lease ${lease.id} using getLeaseVerificationStatus`);
      
      // Calculate status using lease-level verification logic
      console.log(`[LEASE STATUS] Lease data being passed to verification service:`, {
        leaseId: lease.id,
        leaseType: (lease as any).leaseType,
        residentsCount: lease.Resident?.length || 0,
        verificationsCount: lease.IncomeVerification?.length || 0
      });
      
      let status = getLeaseVerificationStatus(lease as any);
      console.log(`[LEASE STATUS] getLeaseVerificationStatus returned: ${status}`);
      
      // Apply override logic if verification is finalized
      if (status === 'In Progress - Finalize to Process' && 
          lease.IncomeVerification && 
          lease.IncomeVerification.some((v: any) => v.status === 'FINALIZED')) {
        console.log(`[LEASE STATUS] Overriding status: ${status} -> Verified (has FINALIZED verification)`);
        status = 'Verified';
      }
      
      setUnitVerificationStatus(status);
      
    } catch (error) {
      console.error('Error calculating lease verification status:', error);
    }
  };

  // Income discrepancy detection and resolution functions (UPDATED to use new individual resident modal)
  const checkForIncomeDiscrepancy = useCallback(async () => {
    if (!tenancyData || discrepancyModalCooldown) return;

    // Check each lease for income discrepancies using the new individual resident approach
    const leases = tenancyData.unit?.Lease || [];
    for (const lease of leases) {
      const verification = lease.IncomeVerification.find(v => v.status === 'IN_PROGRESS') || 
                         lease.IncomeVerification.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      if (!verification) return;

      // Check if all residents are finalized
      const allResidents = lease.Resident;
      const finalizedResidents = allResidents.filter(resident => resident.incomeFinalized || resident.hasNoIncome);
      const allResidentsFinalized = allResidents.length > 0 && finalizedResidents.length === allResidents.length;

      // Only show discrepancy modal if all residents are finalized (or marked as no income) and there are individual discrepancies
      // Check for discrepancies when all residents are ready (either finalized OR marked as no income), even if verification is still IN_PROGRESS
      if (allResidentsFinalized && (verification.status === 'FINALIZED' || verification.status === 'IN_PROGRESS')) {
        console.log(`[AUTO DISCREPANCY CHECK] Starting automatic discrepancy check for lease ${lease.id}`);
        console.log(`[AUTO DISCREPANCY CHECK] Lease name: ${lease.name}`);
        console.log(`[AUTO DISCREPANCY CHECK] All residents finalized: ${allResidentsFinalized}`);
        console.log(`[AUTO DISCREPANCY CHECK] Verification status: ${verification.status}`);
        
        // Check if this is a future/provisional lease (no Tenancy record)
        const isFutureLease = !lease.Tenancy;
        const totalRentRollIncome = allResidents.reduce((sum, resident) => sum + (resident.annualizedIncome || 0), 0);
        
        console.log(`[AUTO DISCREPANCY CHECK] Total rent roll income: $${totalRentRollIncome}`);
        console.log(`[AUTO DISCREPANCY CHECK] Is future lease (no Tenancy): ${isFutureLease}`);
        console.log(`[AUTO DISCREPANCY CHECK] Lease Tenancy:`, lease.Tenancy);
        console.log(`[AUTO DISCREPANCY CHECK] Individual residents:`, allResidents.map(r => ({
          name: r.name,
          annualizedIncome: r.annualizedIncome,
          calculatedAnnualizedIncome: r.calculatedAnnualizedIncome,
          incomeFinalized: r.incomeFinalized
        })));
        
        if (isFutureLease) {
          console.log(`[AUTO DISCREPANCY CHECK] ✅ Future lease detected (no Tenancy) - skipping discrepancy check`);
          return;
        }
        
        console.log(`[AUTO DISCREPANCY CHECK] ❌ Current lease detected - proceeding with discrepancy check`);
        
        // For current leases, check for legitimate discrepancies
        // IMPORTANT: Skip this check if residents were finalized through individual discrepancy resolution
        // When "Accept Verified Income" is used, it updates annualizedIncome to match calculatedAnnualizedIncome
        const residentsWithDiscrepancies = allResidents.filter(resident => {
          const rentRollIncome = resident.annualizedIncome || 0;
          // For finalized residents, use verifiedIncome (the actual approved amount)
          // This is consistent with the "Total Verified Income" display logic
          const verifiedIncome = resident.verifiedIncome || 0;
          const discrepancy = Math.abs(rentRollIncome - verifiedIncome);
          const hasDiscrepancy = discrepancy > 1.00;
          
          // DEBUG: Log detailed resident data to understand the issue
          console.log(`[DISCREPANCY DEBUG] Resident ${resident.name}:`, {
            id: resident.id,
            rentRollIncome,
            verifiedIncome: resident.verifiedIncome,
            calculatedAnnualizedIncome: resident.calculatedAnnualizedIncome,
            incomeFinalized: resident.incomeFinalized,
            hasNoIncome: resident.hasNoIncome,
            finalizedAt: resident.finalizedAt,
            discrepancy,
            hasDiscrepancy
          });
          
          // SPECIAL CASE: If resident is marked as finalized but has verifiedIncome = 0 and hasNoIncome = true,
          // they should not trigger a discrepancy modal (they were properly marked as no income)
          if (resident.incomeFinalized && resident.verifiedIncome === 0 && resident.hasNoIncome) {
            console.log(`[DISCREPANCY DEBUG] ${resident.name} is properly marked as no income - skipping discrepancy check`);
            return false; // Skip this resident
          }
          
          // If there's a discrepancy AND the resident has been finalized, check if they already
          // resolved it through "Accept Verified Income" which updates annualizedIncome to match calculatedAnnualizedIncome
          const wasResolvedByAcceptingVerifiedIncome = resident.incomeFinalized && 
                                                      Math.abs(rentRollIncome - verifiedIncome) < 1.00;
          
          // Additional check: If resident was finalized very recently (within last 30 seconds), 
          // assume it was through the accept verified income process
          const recentlyFinalized = resident.finalizedAt && 
                                   (new Date().getTime() - new Date(resident.finalizedAt).getTime()) < 30000;
          
          console.log(`[AUTO DISCREPANCY CHECK] Resident ${resident.name}:`, {
            rentRollIncome,
            verifiedIncome,
            discrepancy,
            hasDiscrepancy,
            wasResolvedByAcceptingVerifiedIncome,
            recentlyFinalized,
            finalizedAt: resident.finalizedAt,
            incomeFinalized: resident.incomeFinalized
          });
          
          // Only count as having a discrepancy if there's a real discrepancy AND it wasn't already resolved
          return hasDiscrepancy && !wasResolvedByAcceptingVerifiedIncome && !recentlyFinalized;
        });

        console.log(`[AUTO DISCREPANCY CHECK] Residents with discrepancies: ${residentsWithDiscrepancies.length}`);

        if (residentsWithDiscrepancies.length > 0) {
          console.log(`[AUTO DISCREPANCY CHECK] 🚨 TRIGGERING MODAL - Found ${residentsWithDiscrepancies.length} residents with discrepancies`);
          console.log(`[AUTO DISCREPANCY CHECK] Residents triggering modal:`, residentsWithDiscrepancies.map(r => r.name));
          
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
        } else {
          console.log(`[AUTO DISCREPANCY CHECK] ✅ No discrepancies found - modal not triggered`);
          
          // If all residents are finalized and there are no discrepancies, auto-finalize the verification
          if (verification.status === 'IN_PROGRESS') {
            console.log(`[AUTO DISCREPANCY CHECK] 🚀 Auto-finalizing verification ${verification.id} - all residents complete, no discrepancies`);
            
            try {
              const response = await fetch(`/api/leases/${lease.id}/verifications/${verification.id}/finalize-verification`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                }
              });

              if (response.ok) {
                console.log(`[AUTO DISCREPANCY CHECK] ✅ Verification ${verification.id} auto-finalized successfully`);
                // Refresh data to show updated status
                await fetchTenancyData(false);
                await fetchUnitVerificationStatus();
              } else {
                console.error(`[AUTO DISCREPANCY CHECK] ❌ Failed to auto-finalize verification:`, await response.text());
              }
            } catch (error) {
              console.error(`[AUTO DISCREPANCY CHECK] ❌ Error auto-finalizing verification:`, error);
            }
          }
        }
      } else {
        console.log(`[AUTO DISCREPANCY CHECK] Conditions not met:`, {
          allResidentsFinalized,
          verificationStatus: verification?.status,
          leaseId: lease.id,
          leaseName: lease.name
        });
      }
    }
  }, [tenancyData, discrepancyModalCooldown]);

  // Run discrepancy check when tenancy data changes
  useEffect(() => {
    // Add a small delay to ensure fresh data after database updates
    const timer = setTimeout(() => {
      checkForIncomeDiscrepancy();
    }, 500); // 500ms delay to allow database updates to complete
    
    return () => clearTimeout(timer);
  }, [checkForIncomeDiscrepancy]);

  // Handler functions for discrepancy resolution modal - REMOVED (replaced with new individual resident modal handlers)

  // New function to create lease periods based on tenancy data
  const createLeasePeriods = () => {
    if (!tenancyData || tenancyData.isVacant) return [];
    
    // TODO: Implement rent roll reconciliation logic.
    // This function currently displays all leases for a unit. In the future, we will need to
    // implement a mechanism to match provisional leases with new tenancies from rent roll uploads.
    // This could involve a UI where the user can select a provisional lease to link to a new tenancy.

    // Filter out duplicate leases based on key lease information
    const uniqueLeases = (tenancyData.unit?.Lease || []).filter((lease, index, allLeases) => {
      // Find the first lease with matching key information
      const firstMatchingIndex = allLeases.findIndex(otherLease => {
        const sameStartDate = lease.leaseStartDate === otherLease.leaseStartDate;
        const sameEndDate = lease.leaseEndDate === otherLease.leaseEndDate;
        const sameRent = lease.leaseRent === otherLease.leaseRent;
        return sameStartDate && sameEndDate && sameRent;
      });
      
      // Only keep the first occurrence of each unique lease
      // Prefer leases with verified residents (incomeFinalized = true)
      if (firstMatchingIndex === index) {
        return true; // This is the first occurrence
      } else {
        // Check if this lease has verified residents while the first one doesn't
        const thisLeaseHasVerified = lease.Resident?.some(r => r.incomeFinalized) || false;
        const firstLeaseHasVerified = allLeases[firstMatchingIndex].Resident?.some(r => r.incomeFinalized) || false;
        
        // Keep this lease if it has verified residents and the first one doesn't
        return thisLeaseHasVerified && !firstLeaseHasVerified;
      }
    });

    return uniqueLeases.map(lease => {
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
          <BackToPropertyLink 
            propertyId={propertyId as string} 
            className="inline-block mt-4 text-brand-blue hover:underline"
          />
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
          <BackToPropertyLink 
            propertyId={propertyId as string} 
            className="text-brand-blue hover:underline"
          />
        </div>
      </div>
    );
  }

  // Handle vacant units with a special UI
  // Only show "No Current or Future Leases" if there are truly no leases at all
  const hasFutureLeases = tenancyData.unit?.Lease && tenancyData.unit.Lease.length > 0;
  
  if (tenancyData.isVacant && !hasFutureLeases) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <BackToPropertyLink 
            propertyId={propertyId as string}
            className="text-brand-blue hover:underline mb-4 inline-block"
          />
          
          <h1 className="text-4xl font-bold text-brand-blue mb-6">
            Unit {formatUnitNumber(tenancyData?.unit?.unitNumber || '')} - Vacant Unit
          </h1>
          
          {/* Unit Information */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-2xl font-semibold text-brand-blue mb-4">Unit Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Unit Number</p>
                <p className="text-lg font-semibold text-gray-900">{formatUnitNumber(tenancyData?.unit?.unitNumber || '')}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Square Footage</p>
                <p className="text-lg font-semibold text-gray-900">
                  {tenancyData?.unit?.squareFootage ? tenancyData.unit.squareFootage.toLocaleString() : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Bedrooms</p>
                <p className="text-lg font-semibold text-gray-900">
                  {tenancyData?.unit?.bedroomCount ?? 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Status</p>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                  Vacant
                </span>
              </div>
            </div>
          </div>

          {/* Vacant Unit Message */}
          <div className="bg-white p-8 rounded-lg shadow-md mb-8">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H9m0 0H5m0 0h2M7 3h10M9 9h6m-6 4h6m-6 4h6" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Current or Future Leases</h3>
              <p className="text-gray-600 mb-6">
                This unit is currently vacant and has no current lease or future lease associated with this rent roll period.
              </p>
              
              {/* Future Leases Section */}
              {tenancyData.unit.Lease && tenancyData.unit.Lease.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-3">Future Leases</h4>
                  <div className="space-y-3">
                    {tenancyData.unit.Lease.map((lease: any) => (
                      <div key={lease.id} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium text-purple-900">{lease.name}</p>
                            <p className="text-sm text-purple-700">
                              {lease.leaseStartDate && lease.leaseEndDate
                                ? `${new Date(lease.leaseStartDate).toLocaleDateString()} - ${new Date(lease.leaseEndDate).toLocaleDateString()}`
                                : 'Dates TBD'
                              }
                            </p>
                          </div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            Future Lease
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <button
                onClick={() => setCreateLeaseDialogOpen(true)}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-brand-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create Future Lease
              </button>
            </div>
          </div>
        </div>

        {/* Create Lease Dialog */}
        {isCreateLeaseDialogOpen && (
          <CreateLeaseDialog
            isOpen={isCreateLeaseDialogOpen}
            onClose={() => setCreateLeaseDialogOpen(false)}
            unitId={unitId as string}
            onSubmit={async (leaseData) => {
              try {
                const response = await fetch(`/api/units/${unitId}/leases`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    ...leaseData,
                    rentRollId: rentRollId as string, // Pass rent roll context
                  }),
                });

                if (!response.ok) {
                  const errorData = await response.json();
                  throw new Error(errorData.error || 'Failed to create lease');
                }

                setCreateLeaseDialogOpen(false);
                fetchTenancyData(false); // Refresh data to show the new lease
              } catch (error) {
                console.error('Error creating lease:', error);
                alert(error instanceof Error ? error.message : 'Failed to create lease');
              }
            }}
          />
        )}
      </div>
    );
  }

  // Handle vacant units that have future leases
  if (tenancyData.isVacant && hasFutureLeases) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <BackToPropertyLink 
            propertyId={propertyId as string}
            className="text-brand-blue hover:underline mb-4 inline-block"
          />
          
          <h1 className="text-4xl font-bold text-brand-blue mb-6">
            Unit {formatUnitNumber(tenancyData?.unit?.unitNumber || '')} - Vacant Unit with Future Leases
          </h1>
          
          {/* Unit Information */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-2xl font-semibold text-brand-blue mb-4">Unit Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Unit Number</p>
                <p className="text-lg font-semibold text-gray-900">{formatUnitNumber(tenancyData?.unit?.unitNumber || '')}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Square Footage</p>
                <p className="text-lg font-semibold text-gray-900">
                  {tenancyData?.unit?.squareFootage ? tenancyData.unit.squareFootage.toLocaleString() : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Bedrooms</p>
                <p className="text-lg font-semibold text-gray-900">
                  {tenancyData?.unit?.bedroomCount ?? 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Status</p>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                  Vacant
                </span>
              </div>
            </div>
          </div>

          {/* Future Leases Section */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-2xl font-semibold text-brand-blue mb-4">Future Leases</h2>
            <div className="space-y-4">
              {tenancyData.unit.Lease.map((lease: any) => (
                <div key={lease.id} className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-medium text-purple-900">{lease.name}</h3>
                      <p className="text-sm text-purple-700">
                        {lease.leaseStartDate && lease.leaseEndDate
                          ? `${new Date(lease.leaseStartDate).toLocaleDateString()} - ${new Date(lease.leaseEndDate).toLocaleDateString()}`
                          : 'Dates TBD'
                        }
                      </p>
                      {lease.leaseRent && (
                        <p className="text-sm text-purple-700">
                          Rent: ${lease.leaseRent.toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      Future Lease
                    </span>
                  </div>
                  
                  {/* Show residents if any */}
                  {lease.Resident && lease.Resident.length > 0 ? (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Residents ({lease.Resident.length}):</h4>
                      <div className="space-y-2">
                        {lease.Resident.map((resident: any) => (
                          <div key={resident.id} className="flex justify-between items-center bg-white p-3 rounded border">
                            <div className="flex-1">
                              <span className="font-medium">{resident.name}</span>
                              {resident.annualizedIncome && (
                                <p className="text-sm text-gray-600">
                                  Rent Roll Income: ${resident.annualizedIncome.toLocaleString()}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center space-x-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                resident.incomeFinalized || resident.hasNoIncome
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {resident.incomeFinalized || resident.hasNoIncome ? 'Verified' : 'Pending'}
                              </span>
                              
                              {/* Action buttons for pending residents */}
                              {!resident.incomeFinalized && !resident.hasNoIncome && (
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => {
                                      // Start verification for this resident
                                      handleStartVerification(lease.id, [{ id: resident.id, name: resident.name }]);
                                    }}
                                    className="inline-flex items-center px-3 py-1 border border-blue-300 text-xs font-medium rounded text-blue-700 bg-white hover:bg-blue-50"
                                  >
                                    Upload Documents
                                  </button>
                                  <button
                                    onClick={async () => {
                                      // Ensure income verification exists, then mark as no income
                                      let verificationId = lease.IncomeVerification?.[0]?.id;
                                      
                                      if (!verificationId) {
                                        // Create income verification first
                                        try {
                                          const response = await fetch(`/api/leases/${lease.id}/verifications`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ reason: 'FUTURE_LEASE_VERIFICATION' })
                                          });
                                          
                                          if (response.ok) {
                                            const verification = await response.json();
                                            verificationId = verification.id;
                                          }
                                        } catch (error) {
                                          console.error('Error creating verification:', error);
                                          alert('Failed to create income verification');
                                          return;
                                        }
                                      }
                                      
                                      if (verificationId) {
                                        handleMarkNoIncome(lease.id, verificationId, resident.id, resident.name);
                                      }
                                    }}
                                    className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                                  >
                                    No Income
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm text-yellow-800">
                        <strong>No residents added yet.</strong> This future lease needs residents to proceed with income verification.
                      </p>
                    </div>
                  )}
                  
                  {/* Action buttons */}
                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        // Navigate to the lease details
                        window.location.href = `/property/${propertyId}/lease/${lease.id}`;
                      }}
                      className="inline-flex items-center px-4 py-2 border border-purple-300 text-sm font-medium rounded-md text-purple-700 bg-white hover:bg-purple-50"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Current Lease Status */}
          <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-2xl font-semibold text-brand-blue mb-4">Current Lease Status</h2>
            <div className="text-center py-8">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 mb-4">
                <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H9m0 0H5m0 0h2M7 3h10M9 9h6m-6 4h6m-6 4h6" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Current Lease</h3>
              <p className="text-gray-600">
                This unit is currently vacant for this rent roll period.
              </p>
            </div>
          </div>

          {/* Create Additional Future Lease Button */}
          <div className="text-center">
            <button
              onClick={() => setCreateLeaseDialogOpen(true)}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-brand-blue hover:bg-blue-700"
            >
              <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create Additional Future Lease
            </button>
          </div>
        </div>

        {/* Create Lease Dialog */}
        {isCreateLeaseDialogOpen && (
          <CreateLeaseDialog
            isOpen={isCreateLeaseDialogOpen}
            onClose={() => setCreateLeaseDialogOpen(false)}
            unitId={unitId as string}
            onSubmit={async (leaseData) => {
              try {
                const response = await fetch(`/api/units/${unitId}/leases`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    ...leaseData,
                    rentRollId: rentRollId as string,
                  }),
                });

                if (!response.ok) {
                  const errorData = await response.json();
                  throw new Error(errorData.error || 'Failed to create lease');
                }

                setCreateLeaseDialogOpen(false);
                fetchTenancyData(false);
              } catch (error) {
                console.error('Error creating lease:', error);
                alert(error instanceof Error ? error.message : 'Failed to create lease');
              }
            }}
          />
        )}
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
        <BackToPropertyLink 
          propertyId={propertyId as string}
          className="text-brand-blue hover:underline mb-4 inline-block"
        />
        <h1 className="text-4xl font-bold text-brand-blue">Unit {formatUnitNumber(tenancyData?.unit?.unitNumber || '')} - Resident Details</h1>
        
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold text-brand-blue mb-4">Unit Information</h2>
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Unit Number</p>
            <p className="text-lg font-semibold text-gray-900">{formatUnitNumber(tenancyData?.unit?.unitNumber || '')}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Square Footage</p>
            <p className="text-lg font-semibold text-gray-900">
              {tenancyData?.unit?.squareFootage ? tenancyData.unit.squareFootage.toLocaleString() : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Bedrooms</p>
            <p className="text-lg font-semibold text-gray-900">
              {tenancyData?.unit?.bedroomCount ?? 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Lease Rent</p>
            <p className="text-lg font-semibold text-gray-900">
              {tenancyData?.lease?.leaseRent 
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
              
              // Calculate verification status specific to this lease period
              let currentVerificationStatus: string;
              
              // Check if this is a future lease (no Tenancy record)
              const isFutureLease = !period.Tenancy;
              
              if (verification?.status === 'IN_PROGRESS') {
                // Check if there are pending validation exception override requests
                const hasPendingValidationException = verification.OverrideRequest?.some(
                  (request: any) => request.type === 'VALIDATION_EXCEPTION' && 
                                   request.status === 'PENDING'
                );
                
                currentVerificationStatus = hasPendingValidationException 
                  ? 'Waiting for Admin Review' 
                  : 'In Progress - Finalize to Process';
              } else if (isFutureLease) {
                // For future leases, calculate status based on resident finalization
                const allResidents = period.Resident || [];
                const finalizedResidents = allResidents.filter((r: any) => r.incomeFinalized);
                
                console.log(`[DEBUG VACANT STATUS] Lease ${period.id}:`, {
                  isFutureLease,
                  allResidentsCount: allResidents.length,
                  residents: allResidents.map((r: any) => r.name),
                  periodKeys: Object.keys(period),
                  hasResident: !!period.Resident
                });
                
                if (allResidents.length === 0) {
                  currentVerificationStatus = 'Vacant';
                } else if (finalizedResidents.length === allResidents.length) {
                  currentVerificationStatus = 'Verified';
                } else {
                  // Check for documents needing admin review
                  const hasDocumentsNeedingReview = allResidents.some((resident: any) => 
                    (resident.IncomeDocument || []).some((doc: any) => doc.status === 'NEEDS_REVIEW')
                  );
                  
                  currentVerificationStatus = hasDocumentsNeedingReview 
                    ? 'Waiting for Admin Review'
                    : 'In Progress - Finalize to Process';
                }
              } else {
                // For current leases, use the unit-level verification status
                console.log(`[RENDER] Using unitVerificationStatus:`, unitVerificationStatus, 'for lease:', period.name);
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
                              const finalizedResidents = allResidents.filter(resident => resident.incomeFinalized || resident.hasNoIncome);
                              const allResidentsFinalized = allResidents.length > 0 && finalizedResidents.length === allResidents.length;
                              
                              if (!allResidentsFinalized) {
                                return <span className="text-gray-400">Not Finalized</span>;
                              }
                              
                              // Calculate verified income only when all residents are finalized
                              // Use the verified income that users have actually accepted
                              const leaseVerifiedIncome = finalizedResidents.reduce((total, resident) => {
                                // For finalized residents, use their verified income (the actual approved amount)
                                // This correctly shows $0 for "No Income" residents
                                const verifiedIncome = resident.verifiedIncome || 0;
                                return total + Number(verifiedIncome);
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
                            const finalizedResidents = allResidents.filter(resident => resident.incomeFinalized || resident.hasNoIncome);
                            const allResidentsFinalized = allResidents.length > 0 && finalizedResidents.length === allResidents.length;
                            const hasIncomeDiscrepancy = currentVerificationStatus === 'Needs Investigation';
                            
                            if (allResidentsFinalized && hasIncomeDiscrepancy && !discrepancyModalCooldown) {
                              console.log(`[BUTTON DISCREPANCY CHECK] Button-triggered discrepancy check for period:`, period.name);
                              
                              // Check if this is a future/provisional lease (no Tenancy record)
                              const isFutureLease = !period.Tenancy;
                              const totalRentRollIncome = allResidents.reduce((sum, resident) => sum + (resident.annualizedIncome || 0), 0);
                              
                              console.log(`[BUTTON DISCREPANCY CHECK] Total rent roll income: $${totalRentRollIncome}`);
                              console.log(`[BUTTON DISCREPANCY CHECK] Is future lease (no Tenancy): ${isFutureLease}`);
                              
                              if (isFutureLease) {
                                console.log(`[BUTTON DISCREPANCY CHECK] ✅ Future lease detected (no Tenancy) - skipping discrepancy check`);
                                return null;
                              }
                              
                              console.log(`[BUTTON DISCREPANCY CHECK] ❌ Current lease detected - proceeding with discrepancy check`);
                              
                              // Find residents with income discrepancies (rent roll vs verified income)
                              const residentsWithDiscrepancies = allResidents.filter(resident => {
                                const rentRollIncome = resident.annualizedIncome || 0;
                                // Use verifiedIncome for residents with hasNoIncome=true, otherwise use calculatedAnnualizedIncome
                                const verifiedIncome = resident.hasNoIncome ? (resident.verifiedIncome || 0) : (resident.calculatedAnnualizedIncome || 0);
                                const discrepancy = Math.abs(rentRollIncome - verifiedIncome);
                                const hasDiscrepancy = discrepancy > 1.00;
                                
                                return hasDiscrepancy;
                              });
                              
                              console.log(`[BUTTON DISCREPANCY CHECK] Found ${residentsWithDiscrepancies.length} residents with discrepancies`);
                              
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

                          {(() => {
                            // Determine if this is a future lease that can be deleted
                            // Future lease criteria (relative to snapshot date, NOT current date):
                            // 1. No lease start date (manually created without dates) = future lease
                            // 2. Lease start date > snapshot date = future lease
                            // 3. Provisional leases (no Tenancy) = always deletable
                            
                            const snapshotDate = tenancyData?.rentRoll?.uploadDate;
                            const leaseStartDate = period.leaseStartDate;
                            
                            const isFutureLease = 
                              // No Tenancy = provisional lease (always deletable)
                              !period.Tenancy ||
                              // No start date = manually created future lease without dates
                              !leaseStartDate ||
                              // Start date after snapshot date = future lease
                              (leaseStartDate && snapshotDate && 
                               new Date(leaseStartDate) > new Date(snapshotDate));
                            
                            const showLeaseActions = isFutureLease;
                            
                            if (!showLeaseActions) return null;
                            
                            return (
                              <>
                                {period.isProvisional && (
                                  <button
                                    onClick={() => {
                                      setSelectedLeaseForResident(period);
                                      setInitialAddResidentDialogOpen(true);
                                    }}
                                    className="text-xs text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded transition-colors"
                                  >
                                    Add Resident
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteFutureLease(period)}
                                  className="text-xs text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                                >
                                  🗑️ Delete Lease
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Residents List */}
                  {period.Resident.length > 0 ? (
                    <div className="divide-y divide-gray-200">
                      {period.Resident.map((resident) => {
                        // Filter documents for this resident - BOTH from verification AND from resident directly
                        const verificationDocuments = verification?.IncomeDocument?.filter(
                          doc => doc.residentId === resident.id
                        ) || [];
                        
                        // Also get documents directly from resident (in case they're not linked to verification)
                        const directResidentDocuments = (resident as any).IncomeDocument || [];
                        
                        // DEBUG: Log document sources for troubleshooting
                        if (resident.name === 'Henry Dellaquila') {
                          console.log(`[DOCUMENT DEBUG] Henry Dellaquila document sources:`, {
                            verificationDocuments: verificationDocuments.length,
                            directResidentDocuments: directResidentDocuments.length,
                            verificationDocsDetails: verificationDocuments.map((d: any) => ({ id: d.id, type: d.documentType, status: d.status })),
                            directDocsDetails: directResidentDocuments.map((d: any) => ({ id: d.id, type: d.documentType, status: d.status })),
                            residentObject: resident
                          });
                        }
                        
                        // Combine and deduplicate documents by ID
                        const allDocuments = [...verificationDocuments, ...directResidentDocuments];
                        const residentDocuments = allDocuments.filter((doc, index, self) => 
                          index === self.findIndex(d => d.id === doc.id)
                        );
                        
                        // Calculate completed documents (status COMPLETED, regardless of calculated income)
                        const completedResidentDocuments = residentDocuments.filter(
                          doc => doc.status === 'COMPLETED'
                        );
                        
                        // Calculate resident verified income from their actual verified amount
                        // For finalized residents, use the verifiedIncome field (what they actually accepted)
                        let residentVerifiedIncome = 0;
                        if (resident.incomeFinalized) {
                          // For finalized residents, show the verifiedIncome (the actual approved amount)
                          // This correctly shows $0 for "No Income" residents
                          residentVerifiedIncome = resident.verifiedIncome || 0;
                        } else {
                          // For non-finalized residents, show real-time calculation as preview
                          residentVerifiedIncome = resident.calculatedAnnualizedIncome ? Number(resident.calculatedAnnualizedIncome) : 0;
                        }

                        const isResidentFinalized = resident.incomeFinalized || resident.hasNoIncome || false;
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
                                    ) : hasCompletedDocuments && !isResidentFinalized ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                        📋 Ready to Finalize
                                      </span>
                                    ) : hasCompletedDocuments && isResidentFinalized && residentVerifiedIncome === 0 ? (
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
                                          {(needsReview || isDenied || isApproved) && (
                                            <div className={`mb-2 text-xs font-medium flex items-center ${
                                              isDenied ? 'text-red-700' : (isApproved ? 'text-green-700' : 'text-yellow-700')
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
                                          
                                          {needsReview && (
                                            <div className="mb-2 p-2 bg-yellow-100 border border-yellow-200 rounded text-xs">
                                              <div className="font-medium text-yellow-800 mb-1">⏳ Waiting for Admin Review</div>
                                              <div className="text-yellow-700">Needs Admin Review for Verification</div>
                                            </div>
                                          )}
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

                                          {/* User-triggered admin review for completed documents */}
                                          {doc.status === 'COMPLETED' && !hasPendingRequest && (
                                            <div className="mt-2 pt-2 border-t border-gray-100">
                                              <button
                                                onClick={() => openDocumentReviewModal(doc as any, verification.id, period.name)}
                                                className="text-xs text-orange-600 hover:text-orange-700 hover:underline"
                                              >
                                                🔍 Request Admin Review
                                              </button>
                                              <div className="text-xs text-gray-500 mt-1">
                                                Think the extraction is incorrect? Request manual review.
                                              </div>
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
                                          
                                          {doc.documentType === 'SOCIAL_SECURITY' && !needsReview && (
                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                              {doc.documentDate && (
                                                <div>
                                                  <span className="font-medium text-gray-700">Letter Date:</span>
                                                  <div className="text-gray-600">
                                                    {format(new Date(doc.documentDate), 'MMM d, yyyy')}
                                                  </div>
                                                </div>
                                              )}
                                              {doc.grossPayAmount && (
                                                <div>
                                                  <span className="font-medium text-gray-700">Monthly Benefit:</span>
                                                  <div className="text-green-700 font-semibold">
                                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.grossPayAmount)}
                                                  </div>
                                                </div>
                                              )}
                                              {doc.calculatedAnnualizedIncome && (
                                                <div className="col-span-2">
                                                  <span className="font-medium text-gray-700">Annual Income:</span>
                                                  <div className="text-green-700 font-semibold">
                                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.calculatedAnnualizedIncome)}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          
                                          {(doc.documentType === 'OTHER' || doc.documentType === 'SSA_1099' || doc.documentType === 'BANK_STATEMENT' || doc.documentType === 'OFFER_LETTER') && !needsReview && (
                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                              {doc.employeeName && (
                                                <div>
                                                  <span className="font-medium text-gray-700">Employee:</span>
                                                  <div className="text-gray-600">
                                                    {doc.employeeName}
                                                  </div>
                                                </div>
                                              )}
                                              {doc.employerName && (
                                                <div>
                                                  <span className="font-medium text-gray-700">Employer:</span>
                                                  <div className="text-gray-600">
                                                    {doc.employerName}
                                                  </div>
                                                </div>
                                              )}
                                              {doc.documentDate && (
                                                <div>
                                                  <span className="font-medium text-gray-700">Document Date:</span>
                                                  <div className="text-gray-600">
                                                    {format(new Date(doc.documentDate), 'MMM d, yyyy')}
                                                  </div>
                                                </div>
                                              )}
                                              {doc.calculatedAnnualizedIncome && (
                                                <div className="col-span-2">
                                                  <span className="font-medium text-gray-700">Annual Income:</span>
                                                  <div className="text-green-700 font-semibold">
                                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.calculatedAnnualizedIncome)}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {doc.documentType === 'W2' && doc.status === 'COMPLETED' && doc.box1_wages && (
                                            <div className="space-y-2">
                                                {/* Successfully extracted W2 data */}
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
                                            </div>
                                          )}
                                          {doc.documentType === 'SSA_1099' && (
                                            <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                                              <p><strong>Beneficiary:</strong> {doc.employeeName || 'N/A'}</p>
                                              {doc.documentDate && (
                                                <p><strong>Tax Year:</strong> {new Date(doc.documentDate).getFullYear()}</p>
                                              )}
                                              <div className="grid grid-cols-2 gap-x-4 pt-1">
                                                <p><strong>Monthly Benefit:</strong> {doc.grossPayAmount ? `$${doc.grossPayAmount.toLocaleString()}` : 'N/A'}</p>
                                                <p><strong>Annual Benefits:</strong> {doc.calculatedAnnualizedIncome ? `$${doc.calculatedAnnualizedIncome.toLocaleString()}` : 'N/A'}</p>
                                              </div>
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
                                          await handleMarkNoIncome(period.id, newVerification.verificationId, resident.id, resident.name);
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
            tenancyData?.unit?.Lease?.find(l => l.Tenancy && l.leaseStartDate)
              ?.Resident || []
          }
        />
      )}

      {uploadDialogData && (
        <IncomeVerificationUploadDialog
          isOpen={isUploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          verificationId={uploadDialogData.verificationId}
          onUploadComplete={() => {
            // Delay refresh to allow success message to be seen - success message handled by upload form
            setTimeout(() => {
              fetchTenancyData(false);
            }, 1000); // 1 second delay to allow success message to be displayed
            // Keep dialog open for additional uploads
          }}
          residents={uploadDialogData.residents}
          allCurrentLeaseResidents={
            tenancyData?.unit?.Lease?.find(l => l.Tenancy && l.leaseStartDate)
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

               // Refresh data with proper timing after finalization
               await refreshDataAfterFinalization();
               
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
           onDataRefresh={refreshDataAfterFinalization}
         />
       )}

       {overrideModal.isOpen && (
         <OverrideRequestModal
           isOpen={overrideModal.isOpen}
           onClose={() => setOverrideModal({ isOpen: false, documentId: null, verificationId: null, residentId: null, title: '', description: '' })}
           onSubmit={submitDocumentReview}
           type="DOCUMENT_REVIEW"
           context={{
             title: overrideModal.title,
             description: overrideModal.description,
             documentId: overrideModal.documentId || undefined,
             verificationId: overrideModal.verificationId || undefined,
             residentId: overrideModal.residentId || undefined
           }}
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

      {/* Delete Lease Dialog */}
      {deleteLeaseDialog.isOpen && deleteLeaseDialog.lease && (
        <DeleteLeaseDialog
          isOpen={deleteLeaseDialog.isOpen}
          onClose={() => setDeleteLeaseDialog({ isOpen: false, lease: null })}
          onConfirm={handleConfirmDeleteLease}
          lease={deleteLeaseDialog.lease}
        />
      )}

      </div>
    </div>
  );
}
