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
  verificationId: string;
  onUploadComplete: (message?: string) => void;
  residents: Array<{ id: string; name: string }>;
  allCurrentLeaseResidents?: Array<{ id: string; name: string }>;
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
  verificationId,
  onUploadComplete,
  residents,
  allCurrentLeaseResidents,
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
      const response = await fetch('/api/override-requests', {
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
        // showSuccessMessage('Admin override request submitted successfully. You will be notified when reviewed.'); // Removed
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
      // showSuccessMessage('Document uploaded successfully with date confirmation.'); // Removed
      
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
      // Actually create the lease via API, including rent roll context
      const response = await fetch(`/api/units/${unitId}/leases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          rentRollId: rentRollId // Pass rent roll context
        }),
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
      setNewVerificationId(newVerification.verificationId);
      
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
    console.log('[ASSIGN DOCUMENTS] Debug values:', {
      newLeaseId,
      newVerificationId,
      pendingFileUpload: !!pendingFileUpload,
      selectedResidentId
    });
    
    if (!newLeaseId || !newVerificationId || !pendingFileUpload) {
      console.error('[ASSIGN DOCUMENTS] Missing required data - cannot proceed');
      throw new Error('Missing required data - cannot proceed with document assignment');
    }

    setIsSubmitting(true);
    
    try {
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

      // Success - close dialog and clean up
      setDocumentAssignmentDialogOpen(false);
      onUploadComplete('New lease created successfully with documents uploaded!');
      
      // Clean up state
      setIsSubmitting(false);
      setSelectedFiles([]);
      setDateDiscrepancyModal({ isOpen: false, data: null });
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
      setIsSubmitting(false);
      // Re-throw the error so the DocumentAssignmentDialog can handle it
      throw err;
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
    console.log(`🚀 [FRONTEND] handleSubmit called with ${selectedFiles.length} files for resident ${selectedResident}`);
    console.log(`🔍 [VALIDATION DEBUG] selectedFiles:`, selectedFiles);
    console.log(`🔍 [VALIDATION DEBUG] selectedResident:`, selectedResident);
    console.log(`🔍 [VALIDATION DEBUG] selectedResident type:`, typeof selectedResident);
    console.log(`🔍 [VALIDATION DEBUG] selectedResident truthy:`, !!selectedResident);

    if (selectedFiles.length === 0 || !selectedResident) {
      console.log(`❌ [VALIDATION DEBUG] Validation failed - selectedFiles.length: ${selectedFiles.length}, selectedResident: "${selectedResident}"`);
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

    // Check file sizes (individual files should be under 5MB, total under 8MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file
    const MAX_TOTAL_SIZE = 8 * 1024 * 1024; // 8MB total
    
    const oversizedFiles = selectedFiles.filter(f => f.file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      setError(`Some files are too large. Maximum file size is 5MB. Large files: ${oversizedFiles.map(f => f.file.name).join(', ')}`);
      return;
    }

    const totalSize = selectedFiles.reduce((sum, f) => sum + f.file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      setError(`Total file size is too large (${(totalSize / 1024 / 1024).toFixed(1)}MB). Please upload fewer files or smaller files. Maximum total size is 8MB.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    // setSuccess(null); // This line is removed

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

      // Parse response with proper error handling
      let checkResult;
      try {
        checkResult = await checkResponse.json();
      } catch (parseError) {
        console.error(`❌ [FRONTEND] Failed to parse check-dates response as JSON:`, parseError);
        console.error(`❌ [FRONTEND] Check-dates response status: ${checkResponse.status}`);
        
        // Handle common server errors for check-dates
        if (checkResponse.status === 413) {
          throw new Error('Files are too large for date checking. Please try uploading smaller files or fewer files at once.');
        } else if (checkResponse.status === 504) {
          throw new Error('Date check timeout. Please try uploading fewer files at once.');
        } else {
          throw new Error(`Date check failed (${checkResponse.status}). Please try uploading fewer files at once.`);
        }
      }

      if (!checkResponse.ok) {
        throw new Error(checkResult.error || 'Date check failed');
      }
      
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
        
        // Parse response once
        let data;
        try {
          data = await response.json();
          console.log(`📡 [FRONTEND] Parsed response data:`, data);
        } catch (parseError) {
          console.error(`❌ [FRONTEND] Failed to parse response as JSON:`, parseError);
          console.error(`❌ [FRONTEND] Response status: ${response.status}`);
          console.error(`❌ [FRONTEND] Response headers:`, Object.fromEntries(response.headers.entries()));
          
          // Try to get the response text to see what the server actually returned
          try {
            const responseText = await response.text();
            console.error(`❌ [FRONTEND] Response text:`, responseText);
            
            // Handle common server errors
            if (response.status === 413) {
              throw new Error('File size too large. Please try uploading smaller files or fewer files at once.');
            } else if (response.status === 504) {
              throw new Error('Upload timeout. Please try uploading fewer files at once.');
            } else if (responseText.includes('Request Entity Too Large')) {
              throw new Error('Files are too large. Please try uploading smaller files or fewer files at once.');
            } else {
              throw new Error(`Server error (${response.status}): ${responseText.substring(0, 100)}...`);
            }
          } catch (textError) {
            throw new Error(`Server error (${response.status}). Please try uploading fewer files at once.`);
          }
        }

        if (!response.ok) {
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
      console.log(`🎉 [FRONTEND] All uploads completed successfully! Processing success callback...`);
      const successMsg = `Successfully uploaded ${selectedFiles.length} document${selectedFiles.length > 1 ? 's' : ''}. Analysis has started.`;
      console.log(`✅ [FRONTEND] Calling onUploadComplete with message: "${successMsg}"`);
      onUploadComplete(successMsg);
      
      // Reset form (keep resident selected if uploading for specific resident)
      setSelectedFiles([]);
      if (residents.length > 1) {
        setSelectedResident('');
      }
      (e.target as HTMLFormElement).reset();

      // Call parent immediately to refresh data
      // onUploadComplete(); // This line is removed
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.log(`🚨 [FRONTEND] Caught error in handleSubmit:`, errorMessage);
      setError(errorMessage);
      // setSuccess(null); // This line is removed
      console.log(`🚨 [FRONTEND] Error state set to:`, errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      {error && <div className="p-3 bg-red-100 text-red-700 rounded-md">{error}</div>}
      {/* {success && <div className="p-3 bg-green-100 text-green-700 rounded-md">{success}</div>} */}
      
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
      isProcessing={isSubmitting}
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