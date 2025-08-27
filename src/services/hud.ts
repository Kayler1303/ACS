// src/services/hud.ts

// In-memory cache
const cache = new Map<string, Record<string, unknown>>();

const stateNameToAbbreviation: { [key: string]: string } = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
    "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO",
    "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
    "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT",
    "virginia": "VA", "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
    "district of columbia": "DC"
};

function getStateAbbreviation(stateIdentifier: string): string | null {
    const lowerState = stateIdentifier.toLowerCase().trim();
    if (lowerState.length === 2 && Object.values(stateNameToAbbreviation).map(v => v.toLowerCase()).includes(lowerState)) {
        return lowerState.toUpperCase();
    }
    return stateNameToAbbreviation[lowerState] || null;
}

const API_BASE_URL = 'https://www.huduser.gov/hudapi/public';

export async function getHudIncomeLimits(county: string, state: string, year: number = new Date().getFullYear(), placedInServiceDate?: Date) {
    // Check if property qualifies for HERA Special limits (placed in service before 1/1/2009)
    const useHeraSpecial = placedInServiceDate && placedInServiceDate < new Date('2009-01-01');
    
    // Check if property qualifies for Hold Harmless rule (placed in service after 12/31/2008)
    const useHoldHarmless = placedInServiceDate && placedInServiceDate > new Date('2008-12-31');
    
    const limitType = useHeraSpecial ? 'hera' : (useHoldHarmless ? 'hold-harmless' : 'standard');
    
    const cacheKey = `income-limits-${county}-${state}-${year}-${limitType}`;
    if (cache.has(cacheKey)) {
        console.log(`🎯 [HUD CACHE HIT] ${cacheKey} - returning cached data instantly`);
        return cache.get(cacheKey);
    }
    console.log(`🌐 [HUD CACHE MISS] ${cacheKey} - making external API call to HUD`);

    const apiKey = process.env.HUD_API_KEY;
    if (!apiKey) {
        throw new Error("HUD_API_KEY environment variable not set.");
    }

    const stateAbbr = getStateAbbreviation(state);
    if (!stateAbbr) {
        throw new Error(`State not found: ${state}`);
    }

    // Remove the problematic 'updated' query parameter
    // Add timeout to prevent hanging on HUD API calls
    const countiesController = new AbortController();
    const countiesTimeoutId = setTimeout(() => countiesController.abort(), 10000); // 10 second timeout
    
    let countiesResponse;
    try {
        const countiesStart = Date.now();
        countiesResponse = await fetch(`${API_BASE_URL}/fmr/listCounties/${stateAbbr}?year=${year}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: countiesController.signal
        });
        console.log(`🌐 [HUD API] Counties fetch took ${Date.now() - countiesStart}ms`);
        clearTimeout(countiesTimeoutId);
    } catch (error: any) {
        clearTimeout(countiesTimeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`HUD API counties request timed out after 10 seconds for ${state}`);
        }
        throw error;
    }

    if (!countiesResponse.ok) {
        const errorText = await countiesResponse.text();
        throw new Error(`Failed to fetch counties for ${state}: ${countiesResponse.statusText}. Details: ${errorText}`);
    }

    const countiesData = await countiesResponse.json();
    
    // The county list might not be wrapped in a 'data' object.
    const countiesList = countiesData.data || countiesData;

    if (!Array.isArray(countiesList)) {
        console.error("Unexpected HUD API response structure for counties:", countiesList);
        throw new Error("Unexpected response structure from HUD API for listCounties. Expected an array of counties.");
    }

    // We need to get the FIPS code to use the MTSP endpoint
    const foundCounty = countiesList.find((c: Record<string, unknown>) => {
        if (!c) return false;
        const countyName = c.county_name || c.cntyname;
        return countyName && typeof countyName === 'string' && countyName.toLowerCase().startsWith(county.toLowerCase());
    });
    
    if (!foundCounty) {
        throw new Error(`County '${county}' not found in ${state}.`);
    }

    const fipsCode = foundCounty.fips_code;
    console.log(`[HUD API] Fetching MTSP income limits for ${county}, ${state} (FIPS: ${fipsCode}) for year ${year}`);
    
    // For LIHTC properties, we need to use the MTSP (Multifamily Tax Subsidy Project) endpoint
    // which automatically applies Hold Harmless rules for properties placed in service after 2008
    const incomeLimitsController = new AbortController();
    const incomeLimitsTimeoutId = setTimeout(() => incomeLimitsController.abort(), 10000); // 10 second timeout
    
    let incomeLimitsResponse;
    try {
        const incomeLimitsStart = Date.now();
        incomeLimitsResponse = await fetch(`${API_BASE_URL}/mtspil/data/${fipsCode}?year=${year}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: incomeLimitsController.signal
        });
        console.log(`🌐 [HUD API] Income limits fetch took ${Date.now() - incomeLimitsStart}ms`);
        clearTimeout(incomeLimitsTimeoutId);
    } catch (error: any) {
        clearTimeout(incomeLimitsTimeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`HUD API income limits request timed out after 10 seconds for FIPS code ${fipsCode}`);
        }
        throw error;
    }

    if (!incomeLimitsResponse.ok) {
        const errorText = await incomeLimitsResponse.text();
        throw new Error(`Failed to fetch MTSP income limits for FIPS code ${fipsCode}: ${incomeLimitsResponse.statusText}. Details: ${errorText}`);
    }

    const incomeLimitsData = await incomeLimitsResponse.json();
    
    // Process the response to use HERA Special limits if applicable
    let processedData = incomeLimitsData.data;
    
    if (useHeraSpecial && incomeLimitsData.data) {
        // If HERA Special limits are available and we need them, use those instead
        if (incomeLimitsData.data.hera_special_50percent) {
            console.log(`[HERA Special] Using HERA Special limits for property placed in service ${placedInServiceDate?.toDateString()}`);
            
            // Replace standard income limits with HERA Special limits
            const hera50 = incomeLimitsData.data.hera_special_50percent;
            const hera60 = incomeLimitsData.data.hera_special_60percent;
            const hera80 = incomeLimitsData.data.hera_special_80percent;
            
            const heraLimits = {
                '50percent': {
                    il50_p1: hera50?.hera_special_il50_p1,
                    il50_p2: hera50?.hera_special_il50_p2,
                    il50_p3: hera50?.hera_special_il50_p3,
                    il50_p4: hera50?.hera_special_il50_p4,
                    il50_p5: hera50?.hera_special_il50_p5,
                    il50_p6: hera50?.hera_special_il50_p6,
                    il50_p7: hera50?.hera_special_il50_p7,
                    il50_p8: hera50?.hera_special_il50_p8,
                },
                '60percent': {
                    il60_p1: hera60?.hera_special_il60_p1 || processedData['60percent']?.il60_p1,
                    il60_p2: hera60?.hera_special_il60_p2 || processedData['60percent']?.il60_p2,
                    il60_p3: hera60?.hera_special_il60_p3 || processedData['60percent']?.il60_p3,
                    il60_p4: hera60?.hera_special_il60_p4 || processedData['60percent']?.il60_p4,
                    il60_p5: hera60?.hera_special_il60_p5 || processedData['60percent']?.il60_p5,
                    il60_p6: hera60?.hera_special_il60_p6 || processedData['60percent']?.il60_p6,
                    il60_p7: hera60?.hera_special_il60_p7 || processedData['60percent']?.il60_p7,
                    il60_p8: hera60?.hera_special_il60_p8 || processedData['60percent']?.il60_p8,
                },
                '80percent': {
                    il80_p1: hera80?.hera_special_il80_p1 || processedData['80percent']?.il80_p1,
                    il80_p2: hera80?.hera_special_il80_p2 || processedData['80percent']?.il80_p2,
                    il80_p3: hera80?.hera_special_il80_p3 || processedData['80percent']?.il80_p3,
                    il80_p4: hera80?.hera_special_il80_p4 || processedData['80percent']?.il80_p4,
                    il80_p5: hera80?.hera_special_il80_p5 || processedData['80percent']?.il80_p5,
                    il80_p6: hera80?.hera_special_il80_p6 || processedData['80percent']?.il80_p6,
                    il80_p7: hera80?.hera_special_il80_p7 || processedData['80percent']?.il80_p7,
                    il80_p8: hera80?.hera_special_il80_p8 || processedData['80percent']?.il80_p8,
                }
            };
            
            // Merge HERA limits with existing data, preserving other AMI levels
            processedData = {
                ...processedData,
                ...heraLimits
            };
        } else {
            console.log(`[HERA Special] HERA Special limits not available for this county, using standard limits`);
        }
    } else if (useHoldHarmless) {
        console.log(`[Hold Harmless] Property placed in service ${placedInServiceDate?.toDateString()} - HUD MTSP API automatically applies Hold Harmless rules`);
    } else {
        console.log(`[Standard] Using standard income limits - no PIS date specified or pre-2009 property without HERA eligibility`);
    }
    
    // Store in cache
    cache.set(cacheKey, processedData);
    console.log(`💾 [HUD CACHE] Stored ${cacheKey} for future requests`);

    return processedData;
}

/**
 * Calculate LIHTC maximum rents from income limits
 * LIHTC max rents are typically 30% of the income limit divided by 12 months
 */
export function calculateLihtcMaxRents(incomeLimitsData: Record<string, Record<string, number>>) {
    const maxRents: { [key: string]: { [key: string]: number } } = {};
    
    // Standard bedroom counts and corresponding family sizes (HUD/LIHTC standards)
    // Uses exact fractional values with interpolation for precise calculations
    const bedroomToFamilySize = {
        'studio': 1.0,  // Studio/efficiency (1 person)
        '1br': 1.5,     // 1 bedroom (1.5 persons)
        '2br': 3.0,     // 2 bedroom (3 persons)
        '3br': 4.5,     // 3 bedroom (4.5 persons)
        '4br': 6.0,     // 4 bedroom (6 persons)
        '5br': 8.0,     // 5 bedroom (8 persons estimated)
    };
    
    // AMI percentages commonly used in LIHTC
    const amiPercentages = ['30percent', '50percent', '60percent', '80percent'];
    
    for (const amiPercent of amiPercentages) {
        if (incomeLimitsData[amiPercent]) {
            maxRents[amiPercent] = {};
            
            for (const [bedroom, familySize] of Object.entries(bedroomToFamilySize)) {
                let incomeLimit: number | null = null;
                
                if (familySize % 1 === 0) {
                    // Whole number family size - direct lookup
                    const incomeLimitKey = `il${amiPercent.replace('percent', '')}_p${familySize}`;
                    incomeLimit = incomeLimitsData[amiPercent][incomeLimitKey];
                } else {
                    // Fractional family size - interpolate between floor and ceiling
                    const lowerSize = Math.floor(familySize);
                    const upperSize = Math.ceil(familySize);
                    const fraction = familySize - lowerSize;
                    
                    const lowerKey = `il${amiPercent.replace('percent', '')}_p${lowerSize}`;
                    const upperKey = `il${amiPercent.replace('percent', '')}_p${upperSize}`;
                    
                    const lowerLimit = incomeLimitsData[amiPercent][lowerKey];
                    const upperLimit = incomeLimitsData[amiPercent][upperKey];
                    
                    if (lowerLimit && upperLimit && typeof lowerLimit === 'number' && typeof upperLimit === 'number') {
                        // Linear interpolation: lower + (upper - lower) * fraction
                        incomeLimit = lowerLimit + (upperLimit - lowerLimit) * fraction;
                    }
                }
                
                if (incomeLimit && typeof incomeLimit === 'number') {
                    // LIHTC max rent = 30% of income limit / 12 months
                    const maxRent = Math.round((incomeLimit * 0.30) / 12);
                    maxRents[amiPercent][bedroom] = maxRent;
                }
            }
        }
    }
    
    return maxRents;
}

/**
 * Get Fair Market Rents for comparison
 */
export async function getHudFairMarketRents(county: string, state: string, year: number = 2024) {
    const apiKey = process.env.HUD_API_KEY;
    if (!apiKey) {
        throw new Error("HUD_API_KEY environment variable not set.");
    }

    const stateAbbr = getStateAbbreviation(state);
    if (!stateAbbr) {
        throw new Error(`State not found: ${state}`);
    }

    // Get counties list first to find FIPS code
    const countiesResponse = await fetch(`${API_BASE_URL}/fmr/listCounties/${stateAbbr}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!countiesResponse.ok) {
        const errorText = await countiesResponse.text();
        throw new Error(`Failed to fetch counties for ${state}: ${countiesResponse.statusText}. Details: ${errorText}`);
    }
    
    const countiesData = await countiesResponse.json();
    const countiesList = countiesData.data || countiesData;
    
    const foundCounty = countiesList.find((c: Record<string, unknown>) => {
        if (!c) return false;
        const countyName = c.county_name || c.cntyname;
        return countyName && typeof countyName === 'string' && countyName.toLowerCase().startsWith(county.toLowerCase());
    });
    
    if (!foundCounty) {
        throw new Error(`County '${county}' not found in ${state}.`);
    }
    
    const fipsCode = foundCounty.fips_code;

    // Fetch Fair Market Rents
    const fmrResponse = await fetch(`${API_BASE_URL}/fmr/data/${fipsCode}?year=${year}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!fmrResponse.ok) {
        const errorText = await fmrResponse.text();
        throw new Error(`Failed to fetch FMR for FIPS code ${fipsCode}: ${fmrResponse.statusText}. Details: ${errorText}`);
    }

    const fmrData = await fmrResponse.json();
    return fmrData.data;
}

/**
 * Get comprehensive rent data including income limits, LIHTC max rents, and FMR
 */
export async function getComprehensiveRentData(county: string, state: string, year: number = 2024, placedInServiceDate?: Date) {
    try {
        // Fetch income limits and FMR data in parallel
        const [incomeLimitsData, fmrData] = await Promise.all([
            getHudIncomeLimits(county, state, year, placedInServiceDate),
            getHudFairMarketRents(county, state, year).catch(() => null), // FMR is optional
        ]);

        // Calculate LIHTC max rents from income limits
        const lihtcMaxRents = calculateLihtcMaxRents(incomeLimitsData);

        return {
            incomeLimits: incomeLimitsData,
            lihtcMaxRents,
            fairMarketRents: fmrData,
                                year,
                    county,
                    state,
                    usedHeraSpecial: placedInServiceDate && placedInServiceDate < new Date('2009-01-01'),
                    usedHoldHarmless: placedInServiceDate && placedInServiceDate > new Date('2008-12-31')
        };
    } catch (error) {
        console.error('Error fetching comprehensive rent data:', error);
        throw error;
    }
} 