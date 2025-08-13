'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DocumentType } from '@prisma/client';
import AddResidentDialog from './AddResidentDialog';
import CreateLeaseDialog from './CreateLeaseDialog';
import DateDiscrepancyModal from './DateDiscrepancyModal';
import ResidentSelectionDialog from './ResidentSelectionDialog';
import DocumentAssignmentDialog from './DocumentAssignmentDialog';

interface Resident {
  id: string;
  name: string;
}

interface IncomeVerificationDocumentUploadFormProps {
  onUploadComplete: () => void;
  residents: Resident[];
  allCurrentLeaseResidents?: Resident[]; // NEW: All residents from current lease for renewal selection
  verificationId: string;
  hasExistingDocuments: boolean;
  unitId: string;
  propertyId: string;
  rentRollId: string;
  currentLease?: {
    id: string;
    name: string;
    leaseStartDate?: string;
    leaseEndDate?: string;
  };
}

interface DateDiscrepancyData {
  leaseStartDate: string;
  documentDate: string;
  monthsDifference: number;
  fileData: {
    file: File;
    documentType: string;
    id: string;
  };
  allSelectedFiles?: {
    file: File;
    documentType: string;
    id: string;
  }[];
  selectedResident?: string;
  reason?: string; // Why the modal is being shown
  message?: string; // Custom message from API
}

export default function IncomeVerificationDocumentUploadForm({
  onUploadComplete,
  residents,
  allCurrentLeaseResidents,
  verificationId,
  hasExistingDocuments,
  unitId,
  propertyId,
  rentRollId,
  currentLease,
}: IncomeVerificationDocumentUploadFormProps) {
  
  const [selectedFiles, setSelectedFiles] = useState<Array<{
    file: File;
    documentType: string;
    id: string;
  }>>([]);
  const [selectedResident, setSelectedResident] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [dateDiscrepancyModal, setDateDiscrepancyModal] = useState<{
    isOpen: boolean;
    data: DateDiscrepancyData | null;
  }>({ isOpen: false, data: null });
  const [duplicateError, setDuplicateError] = useState<{
    isVisible: boolean;
    message: string;
    documentType: string;
    residentId: string;
    duplicateDocumentId?: string;
  }>({
    isVisible: false,
    message: '',
    documentType: '',
    residentId: '',
    duplicateDocumentId: ''
  });
  
  // Lease creation workflow state
  const [createLeaseDialogOpen, setCreateLeaseDialogOpen] = useState(false);
  const [residentSelectionDialogOpen, setResidentSelectionDialogOpen] = useState(false);
  const [addResidentDialogOpen, setAddResidentDialogOpen] = useState(false);
  const [documentAssignmentDialogOpen, setDocumentAssignmentDialogOpen] = useState(false);
  const [newLeaseResidents, setNewLeaseResidents] = useState<Array<{ id: string; name: string }>>([]);
  const [newLeaseId, setNewLeaseId] = useState<string | null>(null);
  const [newVerificationId, setNewVerificationId] = useState<string | null>(null);
  const [pendingFileUpload, setPendingFileUpload] = useState<DateDiscrepancyData | null>(null);
  const [newLeaseData, setNewLeaseData] = useState<{ id: string; name: string } | null>(null);

  const router = useRouter();

  // Success message handler with cleanup
  const showSuccessMessage = useCallback((message: string, duration: number = 5000) => {
    console.log('🎉 [SUCCESS MESSAGE] Showing success message:', message);
    // Clear any existing timeout
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
    
    // Set success message
    setSuccess(message);
    
    // Only schedule cleanup if duration > 0 (0 = permanent until dialog closes)
    if (duration > 0) {
      successTimeoutRef.current = setTimeout(() => {
        console.log('🧹 [SUCCESS MESSAGE] Clearing success message after', duration, 'ms');
        setSuccess(null);
        successTimeoutRef.current = null;
      }, duration);
    } else {
      console.log('🎯 [SUCCESS MESSAGE] Message set to persist until dialog closes');
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // Pre-populate resident if there's only one (resident-specific upload)
  useEffect(() => {
    if (residents.length === 1) {
      setSelectedResident(residents[0].id);
    }
  }, [residents]);

  // Generate unique ID for file tracking
  const generateFileId = () => Math.random().toString(36).substr(2, 9);

  // Handle admin override request for duplicate detection
  const handleDuplicateOverride = async () => {
    try {
      const response = await fetch('/api/admin/override-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'DUPLICATE_DOCUMENT',
          userExplanation: `User requests override for duplicate ${duplicateError.documentType} detection. They believe this is not a duplicate document.`,
          residentId: duplicateError.residentId,
          documentId: duplicateError.duplicateDocumentId,
          contextualData: {
            duplicateMessage: duplicateError.message,
            documentType: duplicateError.documentType
          }
        }),
      });

      if (response.ok) {
        setSuccess('Admin override request submitted successfully. You will be notified when reviewed.');
        setDuplicateError({ isVisible: false, message: '', documentType: '', residentId: '', duplicateDocumentId: '' });
      } else {
        setError('Failed to submit override request. Please try again.');
      }
    } catch (err) {
      setError('Failed to submit override request. Please try again.');
    }
  };

  // Handle date discrepancy modal actions
  const handleConfirmCurrentLease = async () => {
    if (!dateDiscrepancyModal.data) return;

    try {
      setIsSubmitting(true);
      
      // Re-upload ALL files with forceUpload flag
      const allFiles = dateDiscrepancyModal.data.allSelectedFiles || [dateDiscrepancyModal.data.fileData];
      const residentId = dateDiscrepancyModal.data.selectedResident || selectedResident;
      
      for (const fileData of allFiles) {
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('documentType', fileData.documentType);
        formData.append('residentId', residentId);
        formData.append('forceUpload', 'true');

        const response = await fetch(`/api/verifications/${verificationId}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          
          // Handle duplicate document error specifically
          if (response.status === 409) {
            throw new Error(`${data.message || `Duplicate document detected for ${fileData.file.name}`}`);
          }
          
          throw new Error(data.error || `Failed to upload ${fileData.file.name}`);
        }
      }

      setDateDiscrepancyModal({ isOpen: false, data: null });
      setSuccess('Document uploaded successfully with date confirmation.');
      
      // Reset form
      setSelectedFiles([]);
      if (residents.length > 1) {
        setSelectedResident('');
      }
      
      onUploadComplete();
      
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNewLease = () => {
    // Store the file data and start lease creation workflow
    if (dateDiscrepancyModal.data) {
      setPendingFileUpload(dateDiscrepancyModal.data);
      setDateDiscrepancyModal({ isOpen: false, data: null });
      setCreateLeaseDialogOpen(true);
    }
  };

  const handleCloseModal = () => {
    setDateDiscrepancyModal({ isOpen: false, data: null });
    setIsSubmitting(false);
  };

  // Lease creation workflow handlers
  const handleLeaseCreated = async (formData: { name: string; leaseStartDate: string; leaseEndDate: string; leaseRent: number | null }) => {
    
    try {
      // Actually create the lease via API
      const response = await fetch(`/api/units/${unitId}/leases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('[NEW LEASE WORKFLOW] Failed to create lease:', data);
        throw new Error(data.error || 'Failed to create lease');
      }

      const createdLease = await response.json();
      
      setNewLeaseId(createdLease.id);
      setNewLeaseData(createdLease);
      
      setCreateLeaseDialogOpen(false);
      
      // Skip lease type dialog - if they're uploading documents for a resident, it's always a renewal
      const renewalResidents = allCurrentLeaseResidents || residents;
      setResidentSelectionDialogOpen(true);
    } catch (err: unknown) {
      console.error('[NEW LEASE WORKFLOW] Error creating lease:', err);
      setError(err instanceof Error ? err.message : 'Failed to create lease');
    }
  };

  // Resident Selection Dialog for Renewals
  const handleResidentSelectionSubmit = async (selectedResidents: Array<{ name: string; annualizedIncome: number | null }>) => {
    console.log('[NEW LEASE WORKFLOW] Selected residents for renewal:', selectedResidents);
    setResidentSelectionDialogOpen(false);
    
    if (selectedResidents.length === 0) {
      // No residents selected, go straight to add residents dialog
      setAddResidentDialogOpen(true);
      return;
    }
    
    try {
      setIsSubmitting(true);
      await handleResidentsAdded(selectedResidents);
    } catch (err: unknown) {
      console.error('[NEW LEASE WORKFLOW] Error in resident creation:', err);
      setError(err instanceof Error ? err.message : 'Failed to copy selected residents');
      setIsSubmitting(false);
    }
  };

  const handleAddAdditionalResidents = () => {
    setResidentSelectionDialogOpen(false);
    setAddResidentDialogOpen(true);
  };

  const handleCloseResidentSelection = () => {
    setResidentSelectionDialogOpen(false);
    setNewLeaseData(null);
    setPendingFileUpload(null);
    setNewVerificationId(null);
    setIsSubmitting(false);
  };

  const handleResidentsAdded = async (residentData: Array<{ name: string; annualizedIncome?: number | null }>) => {
    
    if (!newLeaseId || !pendingFileUpload) {
      console.error('[NEW LEASE WORKFLOW] Missing required data:', { newLeaseId, pendingFileUpload: !!pendingFileUpload });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Create residents in the new lease
      const residentPromises = residentData.map(async (resident, index) => {
        const response = await fetch(`/api/leases/${newLeaseId}/residents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            name: resident.name,
            annualizedIncome: resident.annualizedIncome 
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          console.error(`[NEW LEASE WORKFLOW] Failed to create resident ${resident.name}:`, data);
          throw new Error(data.error || 'Failed to create resident');
        }

        const createdResident = await response.json();
        return createdResident;
      });

      const createdResidents = await Promise.all(residentPromises);
      
      // IMPORTANT: Before creating verification for new lease, auto-finalize any existing IN_PROGRESS verification
      try {
        const finalizeResponse = await fetch(`/api/units/${unitId}/auto-finalize-verification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'User chose to create new lease instead of using current lease for uploaded documents' }),
        });
        
        if (finalizeResponse.ok) {
          const finalizeResult = await finalizeResponse.json();
          console.log('[NEW LEASE WORKFLOW] Auto-finalized existing verification:', finalizeResult.message);
        } else {
          console.log('[NEW LEASE WORKFLOW] No existing verification to finalize or already finalized');
        }
      } catch (finalizeError) {
        console.error('[NEW LEASE WORKFLOW] Error auto-finalizing existing verification:', finalizeError);
        // Continue anyway - the verification creation might still work
      }
      
      // Create income verification for the new lease
      const verificationResponse = await fetch(`/api/leases/${newLeaseId}/verifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!verificationResponse.ok) {
        const data = await verificationResponse.json();
        console.error('[NEW LEASE WORKFLOW] Failed to create verification:', data);
        throw new Error(data.error || 'Failed to create verification');
      }

      const newVerification = await verificationResponse.json();
      setNewVerificationId(newVerification.id);
      
      // Store residents and open document assignment dialog instead of uploading immediately
      setNewLeaseResidents(createdResidents.map(r => ({ id: r.id, name: r.name })));
      setAddResidentDialogOpen(false);
      setDocumentAssignmentDialogOpen(true);
      setIsSubmitting(false);
      
    } catch (err: unknown) {
      console.error('[NEW LEASE WORKFLOW] Error in handleResidentsAdded:', err);
      console.error('[NEW LEASE WORKFLOW] Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      setError(err instanceof Error ? err.message : 'Failed to create residents');
      setIsSubmitting(false);
    }
  };

  const handleCloseLease = () => {
    setCreateLeaseDialogOpen(false);
    setPendingFileUpload(null);
    setNewVerificationId(null);
    setIsSubmitting(false);
  };

  const handleCloseResident = () => {
    setAddResidentDialogOpen(false);
    setNewLeaseData(null);
    setPendingFileUpload(null);
    setNewVerificationId(null);
    setIsSubmitting(false);
  };

  const handleAssignDocuments = async (selectedResidentId: string) => {
    if (!newLeaseId || !newVerificationId || !pendingFileUpload) return;

    try {
      setIsSubmitting(true);
      
      // Upload ALL the documents with forceUpload to bypass date check
      const allFiles = pendingFileUpload.allSelectedFiles || [pendingFileUpload.fileData];

      // Upload each file using the stored verification ID
      for (const fileData of allFiles) {
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('documentType', fileData.documentType);
        formData.append('residentId', selectedResidentId);
        formData.append('forceUpload', 'true');

        const uploadResponse = await fetch(`/api/verifications/${newVerificationId}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          const data = await uploadResponse.json();
          
          // Handle duplicate document error specifically
          if (uploadResponse.status === 409) {
            throw new Error(`${data.message || `Duplicate document detected for ${fileData.file.name}`}`);
          }
          
          throw new Error(data.error || `Failed to upload ${fileData.file.name} to new lease`);
        }
      }

      setDocumentAssignmentDialogOpen(false);
      setSuccess('New lease created successfully with documents uploaded!');
      
      // Clean up state first  
      setIsSubmitting(false); // Clear the original form's submitting state
      setSelectedFiles([]); // Clear the selected files
      setDateDiscrepancyModal({ isOpen: false, data: null }); // Clear modal state
      setPendingFileUpload(null);
      setNewLeaseId(null);
      setNewVerificationId(null);
      setNewLeaseResidents([]);
      
      // Add small delay and trigger data refresh before redirect
      setTimeout(() => {
        // Trigger a refresh by calling the onSuccess callback if provided
        if (onUploadComplete) {
          onUploadComplete();
        }
        
        // Redirect to the unit page
        router.push(`/property/${propertyId}/rent-roll/${rentRollId}/unit/${unitId}`);
      }, 1000); // 1 second delay to allow backend processing
      
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload documents');
      setIsSubmitting(false);
    }
  };

  // Handle multiple file selection
  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files).map(file => ({
      file,
      documentType: '',
      id: generateFileId()
    }));

    setSelectedFiles(prev => [...prev, ...newFiles]);
    setError(null); // Clear any existing errors
  };

  // Update document type for a specific file
  const updateFileDocumentType = (fileId: string, documentType: string) => {
    setSelectedFiles(prev => 
      prev.map(f => f.id === fileId ? { ...f, documentType } : f)
    );
  };

  // Remove a file from the selection
  const removeFile = (fileId: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (selectedFiles.length === 0 || !selectedResident) {
      setError('Please select at least one file and choose a resident.');
      return;
    }

    // Clear any previous errors/success when starting new upload
    setError(null);

    // Check if all files have document types selected
    const filesWithoutType = selectedFiles.filter(f => !f.documentType);
    if (filesWithoutType.length > 0) {
      setError('Please select a document type for all files.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // STEP 1: Check dates BEFORE uploading any files - process ALL files
      const checkFormData = new FormData();
      
      // Add all files and their document types
      selectedFiles.forEach((fileData) => {
        checkFormData.append('files', fileData.file);
        checkFormData.append('documentTypes', fileData.documentType);
      });

      const checkResponse = await fetch(`/api/verifications/${verificationId}/check-dates`, {
        method: 'POST',
        body: checkFormData,
      });

      if (!checkResponse.ok) {
        const data = await checkResponse.json();
        throw new Error(data.error || 'Date check failed');
      }
      
      const checkResult = await checkResponse.json();
      
      // If date confirmation is required, show modal WITHOUT uploading anything
      if (checkResult.requiresDateConfirmation) {
        
        const modalData = {
          leaseStartDate: checkResult.leaseStartDate,
          documentDate: checkResult.documentDate,
          monthsDifference: checkResult.monthsDifference,
          fileData: selectedFiles[0],  // Use first file as representative
          allSelectedFiles: selectedFiles,  // Store ALL selected files
          selectedResident: selectedResident,  // Store the selected resident
          reason: checkResult.reason, // Why the modal is being shown
          message: checkResult.message // Custom message from API
        };
        
        setDateDiscrepancyModal({
          isOpen: true,
          data: modalData
        });
        
        setIsSubmitting(false);
        return; // Stop here - NO FILES UPLOADED YET!
      }

      // STEP 2: If no date discrepancy, proceed with normal upload
      
      // Upload each file individually
      for (const fileData of selectedFiles) {
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('documentType', fileData.documentType);
        formData.append('residentId', selectedResident);

        console.log(`🔄 [FRONTEND] Uploading ${fileData.documentType} for resident...`);
        
        const response = await fetch(`/api/verifications/${verificationId}/upload`, {
          method: 'POST',
          body: formData,
        });

        console.log(`📡 [FRONTEND] Upload response status: ${response.status}`);

        if (!response.ok) {
          const data = await response.json();
          console.log(`❌ [FRONTEND] Upload failed with data:`, data);
          
          // Handle duplicate document error specifically
          if (response.status === 409) {
            console.log(`🚫 [FRONTEND] Duplicate detected, throwing error...`);
            setDuplicateError({
              isVisible: true,
              message: data.message || `A similar ${fileData.documentType} document has already been uploaded for this resident.`,
              documentType: fileData.documentType,
              residentId: selectedResident,
              duplicateDocumentId: data.duplicateDocumentId
            });
            return; // Don't throw error, show duplicate dialog instead
          }
          
          throw new Error(data.error || 'Upload failed');
        }
      }

      // Show success message that persists until user closes dialog
      showSuccessMessage(`Successfully uploaded ${selectedFiles.length} document${selectedFiles.length > 1 ? 's' : ''}. Analysis has started.`, 0); // 0 = never auto-clear
      
      // Reset form (keep resident selected if uploading for specific resident)
      setSelectedFiles([]);
      if (residents.length > 1) {
        setSelectedResident('');
      }
      (e.target as HTMLFormElement).reset();

      // Call parent immediately to refresh data
      onUploadComplete();
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.log(`🚨 [FRONTEND] Caught error in handleSubmit:`, errorMessage);
      setError(errorMessage);
      setSuccess(null); // Clear success message when error occurs
      console.log(`🚨 [FRONTEND] Error state set to:`, errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      {error && <div className="p-3 bg-red-100 text-red-700 rounded-md">{error}</div>}
      {success && <div className="p-3 bg-green-100 text-green-700 rounded-md">{success}</div>}
      
      {/* Duplicate Detection Error with Override Option */}
      {duplicateError.isVisible && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">
                {duplicateError.message}
              </h3>
              <div className="mt-3 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setDuplicateError({ isVisible: false, message: '', documentType: '', residentId: '', duplicateDocumentId: '' })}
                  className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDuplicateOverride}
                  className="inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Request Admin Override
                </button>
              </div>
              <p className="mt-2 text-xs text-red-600">
                If you believe this is not a duplicate document, click "Request Admin Override" to have an administrator review this decision.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="mb-6">
        <label htmlFor="resident" className="block text-sm font-medium text-gray-700 mb-1">
          For which resident?
        </label>
        {residents.length === 1 ? (
          // Show resident name when uploading for specific resident
          <div className="mt-1 block w-full px-3 py-2 text-base bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center">
              <span className="text-blue-800 font-medium">👤 {residents[0].name}</span>
              <span className="ml-2 text-sm text-blue-600">(Selected)</span>
            </div>
          </div>
        ) : (
          // Show dropdown when multiple residents
          <select
            id="resident"
            value={selectedResident}
            onChange={(e) => setSelectedResident(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm rounded-md"
            required
          >
            <option value="" disabled>Select a resident</option>
            {residents.map((resident) => (
              <option key={resident.id} value={resident.id}>
                {resident.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label htmlFor="income-documents" className="block text-sm font-medium text-gray-700 mb-1">
          Income Document Files
        </label>
        <p className="text-xs text-gray-500 mb-2">Upload one or more documents (W-2, pay stubs, etc.) - PDF, JPG, PNG</p>
        <input
          id="income-documents"
          type="file"
          multiple
          onChange={handleFileSelection}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-blue file:text-white hover:file:bg-blue-700"
          accept=".pdf,.jpg,.jpeg,.png"
          required
        />
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Selected Files ({selectedFiles.length})</h4>
          <div className="space-y-3">
            {selectedFiles.map((fileData) => (
              <div key={fileData.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{fileData.file.name}</p>
                  <p className="text-xs text-gray-500">{(fileData.file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <div className="flex items-center space-x-3">
                  <select
                    value={fileData.documentType}
                    onChange={(e) => updateFileDocumentType(fileData.id, e.target.value)}
                    className={`text-sm rounded-md focus:ring-brand-blue focus:border-brand-blue ${
                      fileData.documentType === '' 
                        ? 'border-red-500 border-2 bg-red-50' 
                        : 'border-gray-300'
                    }`}
                    required
                  >
                    <option value="" disabled>Select type</option>
                    <option value="W2">W-2</option>
                    <option value="PAYSTUB">Pay Stub</option>
                    <option value="BANK_STATEMENT">Bank Statement</option>
                    <option value="OFFER_LETTER">Offer Letter</option>
                    <option value="SOCIAL_SECURITY">Social Security Letter</option>
                    <option value="SSA_1099">SSA-1099 (Tax Form)</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeFile(fileData.id)}
                    className="text-red-600 hover:text-red-800 p-1"
                    title="Remove file"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-4">
        <button
          type="submit"
          disabled={isSubmitting || selectedFiles.length === 0}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:bg-gray-400"
        >
          {isSubmitting 
            ? `Uploading ${selectedFiles.length} document${selectedFiles.length > 1 ? 's' : ''}...` 
            : selectedFiles.length === 0 
              ? 'Select Files to Upload'
              : `Upload ${selectedFiles.length} Document${selectedFiles.length > 1 ? 's' : ''}`
          }
        </button>
      </div>
      
    </form>
    
    {/* Dialogs outside form to prevent nesting */}
    {/* Date Discrepancy Modal */}
    <DateDiscrepancyModal
      isOpen={dateDiscrepancyModal.isOpen}
      onClose={() => setDateDiscrepancyModal({ isOpen: false, data: null })}
      leaseStartDate={dateDiscrepancyModal.data?.leaseStartDate || ''}
      documentDate={dateDiscrepancyModal.data?.documentDate || ''}
      onConfirmCurrentLease={handleConfirmCurrentLease}
      onCreateNewLease={handleCreateNewLease}
      reason={dateDiscrepancyModal.data?.reason}
      message={dateDiscrepancyModal.data?.message}
    />
    
    {/* Lease Creation Dialog */}
    <CreateLeaseDialog
      isOpen={createLeaseDialogOpen}
      onClose={handleCloseLease}
      onSubmit={handleLeaseCreated}
      unitId={unitId}
    />
    
    {/* Resident Selection Dialog for Renewals */}
    <ResidentSelectionDialog
      isOpen={residentSelectionDialogOpen}
      onClose={handleCloseResidentSelection}
      onSubmit={handleResidentSelectionSubmit}
      currentResidents={allCurrentLeaseResidents || residents}
      leaseName={newLeaseData?.name || 'New Lease'}
      onAddAdditionalResidents={handleAddAdditionalResidents}
    />
    
    {/* Add Resident Dialog */}
    <AddResidentDialog
      isOpen={addResidentDialogOpen}
      onClose={handleCloseResident}
      onSubmit={handleResidentsAdded}
      leaseName="New Lease"
    />

    {/* Document Assignment Dialog */}
    <DocumentAssignmentDialog
      isOpen={documentAssignmentDialogOpen}
      onClose={() => setDocumentAssignmentDialogOpen(false)}
      newLeaseResidents={newLeaseResidents}
      onAssignDocuments={handleAssignDocuments}
    />
    </>
  );
} 