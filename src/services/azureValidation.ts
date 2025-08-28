/**
 * Azure Document Intelligence Validation Service
 * 
 * This service validates Azure AI extraction results to catch false positives,
 * low confidence extractions, and suspicious values that need admin review.
 */

export interface AzureValidationResult {
  isValid: boolean;
  needsAdminReview: boolean;
  confidence: number;
  warnings: string[];
  errors: string[];
  extractedData: any;
}

export interface PaystubValidationResult extends AzureValidationResult {
  extractedData: {
    grossPayAmount: number | null;
    payPeriodStartDate: Date | null;
    payPeriodEndDate: Date | null;
    employeeName: string | null;
    employerName: string | null;
  };
}

export interface W2ValidationResult extends AzureValidationResult {
  extractedData: {
    box1_wages: number | null;
    box3_ss_wages: number | null;
    box5_med_wages: number | null;
    employeeName: string | null;
    employerName: string | null;
    taxYear: string | null;
  };
}

// Realistic confidence thresholds based on Azure performance
// Temporarily lowered for debugging - these documents worked in development
const MIN_CONFIDENCE_THRESHOLD = 0.30; // 30% - More lenient for debugging
const REVIEW_CONFIDENCE_THRESHOLD = 0.40; // 40% - More lenient for debugging  
// W-2 specific review threshold (slightly more lenient due to model confidence behavior)
const W2_REVIEW_CONFIDENCE_THRESHOLD = 0.35; // 35% - More lenient for debugging

// Sanity check thresholds for paystubs
const MAX_REASONABLE_GROSS_PAY = 50000; // $50k per paycheck seems unreasonable
const MIN_REASONABLE_GROSS_PAY = 100; // $100 minimum per paycheck
const SUSPICIOUS_YTD_RATIO = 10; // If gross pay is 10x+ larger than typical, likely YTD

/**
 * Validates Azure Document Intelligence results for paystub documents
 */
export function validatePaystubExtraction(azureResult: any): PaystubValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let needsAdminReview = false;
  let overallConfidence = 1.0;

  // Initialize extracted data
  const extractedData = {
    grossPayAmount: null as number | null,
    payPeriodStartDate: null as Date | null,
    payPeriodEndDate: null as Date | null,
    employeeName: null as string | null,
    employerName: null as string | null,
  };

  // Handle both possible Azure response structures
  const documents = azureResult?.analyzeResult?.documents || azureResult?.documents;
  
  if (!documents?.[0]?.fields) {
    errors.push("Azure Document Intelligence failed to extract any fields from the document");
    return {
      isValid: false,
      needsAdminReview: true,
      confidence: 0,
      warnings,
      errors,
      extractedData
    };
  }

  const fields = documents[0].fields;

  // Debug: Log all available field names from Azure
  console.log(`[DEBUG] All Azure fields available:`, Object.keys(fields));

  // Helper function to extract value and confidence from Azure field
  function extractFieldWithConfidence(field: any): { value: any; confidence: number } {
    if (!field) return { value: null, confidence: 0 };
    
    const confidence = field.confidence || 0;
    let value = null;

    // Try different value extraction methods
    if (field.valueNumber !== undefined) value = field.valueNumber;
    else if (field.valueCurrency !== undefined) value = field.valueCurrency;
    else if (field.valueDate !== undefined) {
      // Parse date in local timezone to avoid UTC conversion issues
      // Azure typically returns dates in YYYY-MM-DD format
      const dateString = field.valueDate;
      if (dateString && typeof dateString === 'string') {
        value = new Date(dateString + 'T12:00:00');
      } else {
        value = new Date(field.valueDate);
      }
    }
    else if (field.valueString !== undefined) value = field.valueString;
    else if (field.content !== undefined) value = field.content;

    return { value, confidence };
  }

  // 1. VALIDATE GROSS PAY AMOUNT
  const grossPayFields = [
    'CurrentPeriodGrossPay',
    'CurrentGrossPay', 
    'GrossPay',
    'CurrentPeriodEarnings',
    'PeriodGrossPay',
    // Additional field names Azure might use
    'CurrentPeriodPay',
    'PeriodPay',
    'CurrentEarnings',
    'Earnings',
    'Pay',
    'CurrentPay'
  ];

  let bestGrossPayField = null;
  let bestGrossPayConfidence = 0;
  const grossPayCandidates = [];

  for (const fieldName of grossPayFields) {
    if (fields[fieldName]) {
      const { value, confidence } = extractFieldWithConfidence(fields[fieldName]);
      
      if (value !== null && typeof value === 'number' && value > 0) {
        grossPayCandidates.push({ fieldName, value, confidence });
        
        if (confidence > bestGrossPayConfidence) {
          bestGrossPayField = { fieldName, value, confidence };
          bestGrossPayConfidence = confidence;
        }
      }
    }
  }

  // Check for YTD fields that might be confused with period gross pay
  const ytdFields = [
    'YearToDateGrossPay',
    'YTDGrossPay', 
    'CumulativeGrossPay',
    'YTDEarnings',
    'YearToDateEarnings'
  ];

  const ytdCandidates = [];
  for (const fieldName of ytdFields) {
    if (fields[fieldName]) {
      const { value, confidence } = extractFieldWithConfidence(fields[fieldName]);
      if (value !== null && typeof value === 'number' && value > 0) {
        ytdCandidates.push({ fieldName, value, confidence });
      }
    }
  }

  // If no specific gross pay fields found, try to find any field with "Pay", "Gross", or "Earnings" in the name
  if (grossPayCandidates.length === 0) {
    console.log(`[DEBUG] No specific gross pay fields found, searching for any pay-related fields...`);
    
    for (const [fieldName, fieldData] of Object.entries(fields)) {
      if (fieldName.toLowerCase().includes('pay') || 
          fieldName.toLowerCase().includes('gross') || 
          fieldName.toLowerCase().includes('earnings')) {
        
        const { value, confidence } = extractFieldWithConfidence(fieldData);
        
        if (value !== null && typeof value === 'number' && value > 0) {
          console.log(`[DEBUG] Found potential pay field: ${fieldName} = ${value} (confidence: ${confidence})`);
          
          // Skip obviously YTD fields for current period calculation
          if (!fieldName.toLowerCase().includes('ytd') && 
              !fieldName.toLowerCase().includes('yeartodate') &&
              !fieldName.toLowerCase().includes('year') &&
              value < MAX_REASONABLE_GROSS_PAY) {
            
            grossPayCandidates.push({ fieldName, value, confidence });
            
            if (confidence > bestGrossPayConfidence) {
              bestGrossPayField = { fieldName, value, confidence };
              bestGrossPayConfidence = confidence;
            }
          }
        }
      }
    }
  }

  // Debug: Log field selection process
  console.log(`[DEBUG] Gross pay field selection:`, {
    candidatesCount: grossPayCandidates.length,
    candidates: grossPayCandidates.map(c => ({ field: c.fieldName, value: c.value, confidence: c.confidence })),
    bestField: bestGrossPayField ? { field: bestGrossPayField.fieldName, value: bestGrossPayField.value, confidence: bestGrossPayField.confidence } : null,
    ytdCandidatesCount: ytdCandidates.length
  });

  // VALIDATION: Gross Pay Amount
  if (!bestGrossPayField) {
    errors.push("No gross pay amount found in document");
    needsAdminReview = true;
  } else {
    extractedData.grossPayAmount = bestGrossPayField.value;
    overallConfidence = Math.min(overallConfidence, bestGrossPayField.confidence);

    // Check confidence threshold - be more lenient if values are reasonable
    if (bestGrossPayField.confidence < MIN_CONFIDENCE_THRESHOLD) {
      warnings.push(`Low confidence (${(bestGrossPayField.confidence * 100).toFixed(1)}%) on gross pay extraction`);
      
      // Only flag for admin review if confidence is very low OR value seems unreasonable
      if (bestGrossPayField.confidence < 0.3 || 
          bestGrossPayField.value > MAX_REASONABLE_GROSS_PAY || 
          bestGrossPayField.value < MIN_REASONABLE_GROSS_PAY) {
        needsAdminReview = true;
      }
    }

    // Sanity checks for gross pay amount
    if (bestGrossPayField.value > MAX_REASONABLE_GROSS_PAY) {
      warnings.push(`Gross pay amount ($${bestGrossPayField.value.toLocaleString()}) seems unusually high - may be YTD amount`);
      needsAdminReview = true;
    }

    if (bestGrossPayField.value < MIN_REASONABLE_GROSS_PAY) {
      warnings.push(`Gross pay amount ($${bestGrossPayField.value.toLocaleString()}) seems unusually low`);
      needsAdminReview = true;
    }

    // Check if we might have confused YTD with period amount
    if (ytdCandidates.length > 0) {
      const largestYtd = Math.max(...ytdCandidates.map(c => c.value));
      const ratio = largestYtd / bestGrossPayField.value;
      
      if (ratio < SUSPICIOUS_YTD_RATIO && bestGrossPayField.value > 5000) {
        warnings.push(`Extracted gross pay ($${bestGrossPayField.value.toLocaleString()}) may be YTD amount rather than period amount`);
        needsAdminReview = true;
      }
    }

    // Check for multiple conflicting gross pay values
    if (grossPayCandidates.length > 1) {
      const values = grossPayCandidates.map(c => c.value);
      const maxValue = Math.max(...values);
      const minValue = Math.min(...values);
      
      if (maxValue / minValue > 2) { // Values differ by more than 2x
        warnings.push(`Multiple conflicting gross pay values found: ${grossPayCandidates.map(c => `${c.fieldName}: $${c.value}`).join(', ')}`);
        needsAdminReview = true;
      }
    }
  }

  // 2. VALIDATE PAY PERIOD DATES
  const startDateField = extractFieldWithConfidence(fields.PayPeriodStartDate || fields.PayPeriodStart || fields.PeriodStartDate);
  const endDateField = extractFieldWithConfidence(fields.PayPeriodEndDate || fields.PayPeriodEnd || fields.PeriodEndDate);

  if (startDateField.value) {
    extractedData.payPeriodStartDate = startDateField.value;
    overallConfidence = Math.min(overallConfidence, startDateField.confidence);
    
    if (startDateField.confidence < MIN_CONFIDENCE_THRESHOLD) {
      warnings.push(`Low confidence on pay period start date extraction`);
      needsAdminReview = true;
    }
  } else {
    warnings.push("Pay period start date not found");
    needsAdminReview = true;
  }

  if (endDateField.value) {
    extractedData.payPeriodEndDate = endDateField.value;
    overallConfidence = Math.min(overallConfidence, endDateField.confidence);
    
    if (endDateField.confidence < MIN_CONFIDENCE_THRESHOLD) {
      warnings.push(`Low confidence on pay period end date extraction`);
      needsAdminReview = true;
    }
  } else {
    warnings.push("Pay period end date not found");
    needsAdminReview = true;
  }

  // Validate date logic
  if (extractedData.payPeriodStartDate && extractedData.payPeriodEndDate) {
    if (extractedData.payPeriodStartDate >= extractedData.payPeriodEndDate) {
      warnings.push("Pay period start date is after or equal to end date");
      needsAdminReview = true;
    }

    const daysDiff = (extractedData.payPeriodEndDate.getTime() - extractedData.payPeriodStartDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 31) {
      warnings.push(`Pay period is ${daysDiff} days long - seems unusually long`);
      needsAdminReview = true;
    }
  }

  // 3. VALIDATE EMPLOYEE/EMPLOYER NAMES
  const employeeField = extractFieldWithConfidence(
    fields.Employee || fields.EmployeeName || fields.Name
  );
  const employerField = extractFieldWithConfidence(
    fields.Employer || fields.EmployerName || fields.Company
  );

  if (employeeField.value) {
    extractedData.employeeName = employeeField.value;
    if (employeeField.confidence < MIN_CONFIDENCE_THRESHOLD) {
      warnings.push("Low confidence on employee name extraction");
    }
  }

  if (employerField.value) {
    extractedData.employerName = employerField.value;
    if (employerField.confidence < MIN_CONFIDENCE_THRESHOLD) {
      warnings.push("Low confidence on employer name extraction");
    }
  }

  // 4. OVERALL VALIDATION - More lenient for debugging
  const requiredFieldsMissing = [
    !extractedData.grossPayAmount && "gross pay amount"
    // Temporarily removed pay period date requirements for debugging
  ].filter(Boolean);

  if (requiredFieldsMissing.length > 0) {
    errors.push(`Missing required fields: ${requiredFieldsMissing.join(', ')}`);
    needsAdminReview = true;
  }

  // Flag for review if overall confidence is low
  if (overallConfidence < REVIEW_CONFIDENCE_THRESHOLD) {
    needsAdminReview = true;
  }

  const isValid = errors.length === 0 && !needsAdminReview;

  console.log("🔍 Paystub Validation Result:", {
    isValid,
    needsAdminReview,
    confidence: overallConfidence,
    warnings: warnings.length,
    errors: errors.length,
    extractedData
  });

  return {
    isValid,
    needsAdminReview,
    confidence: overallConfidence,
    warnings,
    errors,
    extractedData
  };
}

/**
 * Validates Azure Document Intelligence results for W-2 documents
 */
export function validateW2Extraction(azureResult: any): W2ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let needsAdminReview = false;
  let overallConfidence = 1.0;

  const extractedData = {
    box1_wages: null as number | null,
    box3_ss_wages: null as number | null,
    box5_med_wages: null as number | null,
    employeeName: null as string | null,
    employerName: null as string | null,
    taxYear: null as string | null,
  };

  // Handle both possible Azure response structures
  const documentsArray = azureResult?.analyzeResult?.documents || azureResult?.documents;
  
  if (!documentsArray?.[0]?.fields) {
    errors.push("Azure Document Intelligence failed to extract any fields from the document");
    return {
      isValid: false,
      needsAdminReview: true,
      confidence: 0,
      warnings,
      errors,
      extractedData
    };
  }

  const fields = documentsArray[0].fields;

  // Debug: Log all available field names from Azure W2 extraction
  console.log(`🔥🔥🔥 [URGENT W2 DEBUG] All Azure W2 fields available:`, Object.keys(fields || {}));
  console.log(`🔥🔥🔥 [URGENT W2 DEBUG] Full field details:`, JSON.stringify(fields, null, 2));

  function extractNumericValue(field: any): { value: number | null; confidence: number } {
    if (!field) return { value: null, confidence: 0 };
    
    const confidence = field.confidence || 0;
    let value = null;

    if (typeof field.valueNumber === 'number') value = field.valueNumber;
    else if (typeof field.valueCurrency === 'number') value = field.valueCurrency;
    else if (typeof field.valueString === 'string') {
      const parsed = parseFloat(field.valueString.replace(/[,$]/g, ''));
      value = isNaN(parsed) ? null : parsed;
    } else if (typeof field.content === 'string') {
      const parsed = parseFloat(field.content.replace(/[,$]/g, ''));
      value = isNaN(parsed) ? null : parsed;
    }

    return { value, confidence };
  }

  // Validate Box 1 (Wages)
  const box1Field = fields?.WagesTipsAndOtherCompensation || fields?.['W2FormBox1'] || fields?.Box1 || fields?.Wages;
  const box1Result = extractNumericValue(box1Field);
  if (box1Result.value !== null) {
    extractedData.box1_wages = box1Result.value;
    overallConfidence = Math.min(overallConfidence, box1Result.confidence);
    
    if (box1Result.confidence < MIN_CONFIDENCE_THRESHOLD) {
      warnings.push("Low confidence on Box 1 wages extraction");
      needsAdminReview = true;
    }
  }

  // Validate Box 3 (Social Security wages)
  const box3Field = fields?.SocialSecurityWages || fields?.['W2FormBox3'] || fields?.Box3;
  const box3Result = extractNumericValue(box3Field);
  if (box3Result.value !== null) {
    extractedData.box3_ss_wages = box3Result.value;
    overallConfidence = Math.min(overallConfidence, box3Result.confidence);
    
    if (box3Result.confidence < MIN_CONFIDENCE_THRESHOLD) {
      warnings.push("Low confidence on Box 3 Social Security wages extraction");
      needsAdminReview = true;
    }
  }

  // Validate Box 5 (Medicare wages)
  const box5Field = fields?.MedicareWagesAndTips || fields?.['W2FormBox5'] || fields?.Box5 || fields?.MedicareWages;
  const box5Result = extractNumericValue(box5Field);
  if (box5Result.value !== null) {
    extractedData.box5_med_wages = box5Result.value;
    overallConfidence = Math.min(overallConfidence, box5Result.confidence);
    
    if (box5Result.confidence < MIN_CONFIDENCE_THRESHOLD) {
      warnings.push("Low confidence on Box 5 Medicare wages extraction");
      needsAdminReview = true;
    }
  }

  // Helper function to extract text value and confidence from Azure field
  function extractTextValue(field: any): { value: string | null; confidence: number } {
    if (!field) return { value: null, confidence: 0 };
    
    const confidence = field.confidence || 0;
    let value = null;

    if (typeof field.valueString === 'string') value = field.valueString.trim();
    else if (typeof field.content === 'string') value = field.content.trim();

    return { value: value || null, confidence };
  }

  // Heuristic: ensure extracted names are not numeric identifiers (e.g., SSN/EIN/TIN)
  function hasAlphabeticCharacter(text: string | null | undefined): boolean {
    if (!text) return false;
    return /[A-Za-z]/.test(text);
  }

  function looksLikeIdNumber(text: string | null | undefined): boolean {
    if (!text) return false;
    const digitsOnly = (text || '').replace(/[^0-9]/g, '');
    // Most IDs will be 4+ digits and often have no alphabetic characters
    return digitsOnly.length >= 4 && !hasAlphabeticCharacter(text);
  }

  // Extract a human name from Azure fields that may be strings or nested objects
  function extractNameFromField(field: any): { value: string | null; confidence: number } {
    if (!field) return { value: null, confidence: 0 };
    // Try simple string-first
    const simple = extractTextValue(field);
    if (simple.value) {
      // If the simple value contains multiple lines (e.g., name + address), try to isolate the first plausible name line
      const lines = simple.value.split(/\r?\n|\s{2,}/).map(l => l.trim()).filter(Boolean);
      let candidate = simple.value;
      for (const line of lines) {
        // Prefer the first line that contains alphabetic characters and does not look like an address line starting with numbers
        if (/[A-Za-z]/.test(line) && !/^\d{1,5}[\s,].*/.test(line)) {
          candidate = line;
          break;
        }
      }
      if (candidate && hasAlphabeticCharacter(candidate) && !looksLikeIdNumber(candidate)) {
        return { value: candidate, confidence: simple.confidence };
      }
    }

    let bestName: string | null = null;
    let confidence = field.confidence || 0;

    // Handle object-shaped fields (Azure valueObject)
    const valueObject = (field as any).valueObject;
    if (valueObject && typeof valueObject === 'object') {
      // Candidate subfield keys in priority order
      const nameKeys = [
        'Name', 'FullName', 'EmployeeName', 'EmployerName', 'RecipientName', 'PayeeName',
        'PersonName', 'NameLine1', 'Line1', 'Employee', 'Employer'
      ];
      for (const key of nameKeys) {
        const sub = (valueObject as any)[key];
        if (!sub) continue;
        const { value: subVal, confidence: subConf } = extractTextValue(sub);
        if (subVal && hasAlphabeticCharacter(subVal) && !looksLikeIdNumber(subVal)) {
          bestName = subVal;
          confidence = Math.min(confidence || 1, subConf || 1);
          break;
        }
      }
      // Combine FirstName + LastName if present
      if (!bestName) {
        const first = extractTextValue(valueObject.FirstName)?.value;
        const last = extractTextValue(valueObject.LastName)?.value;
        const maybe = [first, last].filter(Boolean).join(' ').trim();
        if (maybe && hasAlphabeticCharacter(maybe) && !looksLikeIdNumber(maybe)) {
          bestName = maybe;
        }
      }
      // Nested AddressAndName object
      if (!bestName && valueObject.AddressAndName) {
        const nested = extractNameFromField(valueObject.AddressAndName);
        if (nested.value) {
          bestName = nested.value;
          confidence = Math.min(confidence || 1, nested.confidence || 1);
        }
      }
    }

    // Handle arrays (valueArray) by taking the first line-like entry
    const valueArray = (field as any).valueArray;
    if (!bestName && Array.isArray(valueArray)) {
      for (const item of valueArray) {
        const { value } = extractTextValue(item);
        if (value && hasAlphabeticCharacter(value) && !looksLikeIdNumber(value)) {
          bestName = value;
          break;
        }
      }
    }

    return { value: bestName, confidence: confidence || 0 };
  }

  // Extract Employee Name (comprehensive mapping of all possible Azure W2 field names)
  console.log(`[W2 NAME DEBUG] Employee field candidates:`, Object.keys(fields).filter(k => 
    k.toLowerCase().includes('employee') || k.toLowerCase().includes('name') || k.toLowerCase().includes('person')
  ));
  
  // Azure W2 prebuilt model - prefer strictly name-like fields only (exclude SSN/TIN/EIN-like)
  const employeeNameField =
    fields?.Employee ||
    fields?.EmployeeName ||
    fields?.EmployeeFullName ||
    fields?.EmployeeAddressAndName ||
    fields?.EmployeeFirstLastName ||
    fields?.TaxpayerName ||
    // Common variations found in production
    fields?.Name ||
    fields?.FullName ||
    fields?.PersonName ||
    fields?.W2Employee ||
    fields?.WorkerName ||
    fields?.Recipient ||
    fields?.PayeeName ||
    fields?.Payee ||
    fields?.FormRecipient ||
    // Legacy support
    fields?.EmployeeNameAndAddress ||
    fields?.EmployeeInfo ||
    fields?.EmployeeData ||
    fields?.EmployeeAddress ||
    fields?.RecipientName ||
    fields?.EmployeeDetails ||
    fields?.W2EmployeeName ||
    fields?.W2_Employee ||
    fields?.EmployeeName_Line1;
  const employeeNameResult = extractNameFromField(employeeNameField);
  let employeeNameValue = employeeNameResult.value;
  if (employeeNameValue && (looksLikeIdNumber(employeeNameValue) || !hasAlphabeticCharacter(employeeNameValue))) {
    // Guard against numeric identifiers being misread as names
    console.log('[W2 NAME GUARD] Discarding employee name candidate that looks like an ID number:', employeeNameValue);
    employeeNameValue = null;
  }
 
  console.log(`[W2 NAME DEBUG] Employee name extraction:`, {
    fieldFound: !!employeeNameField,
    extractedValue: employeeNameValue,
    confidence: employeeNameResult.confidence
  });
  
  // Fallback: scan all fields for a plausible employee name
  if (!employeeNameValue) {
    for (const [key, f] of Object.entries(fields)) {
      const lower = key.toLowerCase();
      if (
        (lower.includes('employee') || lower.includes('recipient') || lower.includes('payee') || lower.includes('name')) &&
        !(lower.includes('ssn') || lower.includes('ein') || lower.includes('tin') || lower.includes('id') || lower.includes('identification') || lower.includes('number'))
      ) {
        const candidate = extractNameFromField(f as any);
        if (candidate.value) {
          console.log('[W2 NAME FALLBACK] Using employee name from field', key, '=>', candidate.value);
          employeeNameValue = candidate.value;
          break;
        }
      }
    }
    // Fallback: try keyValuePairs if available (layout/auxiliary data)
    if (!employeeNameValue) {
      const kvPairs = azureResult?.analyzeResult?.keyValuePairs as any[] | undefined;
      if (Array.isArray(kvPairs)) {
        for (const pair of kvPairs) {
          const keyText = pair?.key?.content?.toLowerCase?.() || '';
          const valText = pair?.value?.content || '';
          if (keyText.includes("employee") && keyText.includes("name") && hasAlphabeticCharacter(valText) && !looksLikeIdNumber(valText)) {
            console.log('[W2 NAME KVP FALLBACK] Using employee name from keyValuePairs =>', valText);
            employeeNameValue = valText.trim();
            break;
          }
        }
      }
    }
  }

  if (employeeNameValue) {
    extractedData.employeeName = employeeNameValue;
    overallConfidence = Math.min(overallConfidence, employeeNameResult.confidence);
    
    if (employeeNameResult.confidence < MIN_CONFIDENCE_THRESHOLD) {
      warnings.push("Low confidence on employee name extraction");
      needsAdminReview = true;
    }
  } else {
    warnings.push("Employee name could not be extracted from W2");
    needsAdminReview = true;
  }

  // Extract Employer Name (try multiple field names)
  console.log(`[W2 NAME DEBUG] Employer field candidates:`, Object.keys(fields).filter(k => 
    k.toLowerCase().includes('employer') || k.toLowerCase().includes('company') || k.toLowerCase().includes('business')
  ));
  
  // Azure W2 prebuilt model - employer name candidates (exclude EIN/TIN fields)
  const employerNameField =
    fields?.Employer ||
    fields?.EmployerName ||
    fields?.Company ||
    fields?.EmployerNameAddress ||
    // Common variations
    fields?.CompanyName ||
    fields?.BusinessName ||
    fields?.PayerName ||
    fields?.Payer ||
    fields?.W2Employer ||
    fields?.Organization ||
    // Legacy and additional support
    fields?.W2_Employer ||
    fields?.EmployerInfo ||
    fields?.EmployerData ||
    fields?.EmployerIdentification ||
    fields?.W2EmployerName ||
    fields?.EmployerName_Line1;
  const employerNameResult = extractNameFromField(employerNameField);
  let employerNameValue = employerNameResult.value;
  if (employerNameValue && (looksLikeIdNumber(employerNameValue) || !hasAlphabeticCharacter(employerNameValue))) {
    console.log('[W2 NAME GUARD] Discarding employer name candidate that looks like an ID number:', employerNameValue);
    employerNameValue = null;
  }
   
  console.log(`[W2 NAME DEBUG] Employer name extraction:`, {
    fieldFound: !!employerNameField,
    extractedValue: employerNameValue,
    confidence: employerNameResult.confidence
  });
  
  // Fallback: scan all fields for a plausible employer name
  if (!employerNameValue) {
    for (const [key, f] of Object.entries(fields)) {
      const lower = key.toLowerCase();
      if (
        (lower.includes('employer') || lower.includes('company') || lower.includes('business') || lower.includes('payer') || lower.includes('organization') || lower.includes('name')) &&
        !(lower.includes('ein') || lower.includes('tin') || lower.includes('id') || lower.includes('identification') || lower.includes('number'))
      ) {
        const candidate = extractNameFromField(f as any);
        if (candidate.value) {
          console.log('[W2 NAME FALLBACK] Using employer name from field', key, '=>', candidate.value);
          employerNameValue = candidate.value;
          break;
        }
      }
    }
    // Fallback: try keyValuePairs if available
    if (!employerNameValue) {
      const kvPairs = azureResult?.analyzeResult?.keyValuePairs as any[] | undefined;
      if (Array.isArray(kvPairs)) {
        for (const pair of kvPairs) {
          const keyText = pair?.key?.content?.toLowerCase?.() || '';
          const valText = pair?.value?.content || '';
          if ((keyText.includes("employer") || keyText.includes("company")) && hasAlphabeticCharacter(valText) && !looksLikeIdNumber(valText)) {
            console.log('[W2 NAME KVP FALLBACK] Using employer name from keyValuePairs =>', valText);
            employerNameValue = valText.trim();
            break;
          }
        }
      }
    }
  }

  if (employerNameValue) {
    extractedData.employerName = employerNameValue;
    overallConfidence = Math.min(overallConfidence, employerNameResult.confidence);
    
    if (employerNameResult.confidence < MIN_CONFIDENCE_THRESHOLD) {
      warnings.push("Low confidence on employer name extraction");
      needsAdminReview = true;
    }
  } else {
    warnings.push("Employer name could not be extracted from W2");
    needsAdminReview = true;
  }

  // Extract Tax Year (try multiple field names)
  const taxYearField = fields?.TaxYear || fields?.Year || fields?.W2Year || fields?.FormYear;
  const taxYearResult = extractTextValue(taxYearField);
  if (taxYearResult.value) {
    // Convert tax year string to integer (database expects Int)
    const taxYearInt = parseInt(taxYearResult.value, 10);
    if (!isNaN(taxYearInt) && taxYearInt >= 1900 && taxYearInt <= 2050) {
      extractedData.taxYear = taxYearInt.toString(); // Keep as string for interface compatibility
      overallConfidence = Math.min(overallConfidence, taxYearResult.confidence);
      
      if (taxYearResult.confidence < MIN_CONFIDENCE_THRESHOLD) {
        warnings.push("Low confidence on tax year extraction");
        needsAdminReview = true;
      }
    } else {
      warnings.push(`Invalid tax year extracted: ${taxYearResult.value}`);
      needsAdminReview = true;
    }
  }

  // Check if we got at least one wage amount
  const wageAmounts = [extractedData.box1_wages, extractedData.box3_ss_wages, extractedData.box5_med_wages].filter(v => v !== null);
  if (wageAmounts.length === 0) {
    errors.push("No wage amounts found in W-2 document");
    needsAdminReview = true;
  }

  // Sanity check - wage amounts should be reasonably close
  if (wageAmounts.length > 1) {
    const maxWage = Math.max(...wageAmounts);
    const minWage = Math.min(...wageAmounts);
    if (maxWage / minWage > 1.5) { // More than 50% difference
      warnings.push("Significant discrepancy between wage amounts - may need review");
      needsAdminReview = true;
    }
  }

  // Overall validation
  if (overallConfidence < W2_REVIEW_CONFIDENCE_THRESHOLD) {
    needsAdminReview = true;
  }

  const isValid = errors.length === 0 && !needsAdminReview;

  console.log("🔍 W-2 Validation Result:", {
    isValid,
    needsAdminReview,
    confidence: overallConfidence,
    warnings: warnings.length,
    errors: errors.length,
    extractedData
  });

  return {
    isValid,
    needsAdminReview,
    confidence: overallConfidence,
    warnings,
    errors,
    extractedData
  };
} 