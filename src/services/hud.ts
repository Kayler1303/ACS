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

export async function getHudIncomeLimits(county: string, state: string, year: number = 2024) {
    const cacheKey = `income-limits-${county}-${state}-${year}`;
    if (cache.has(cacheKey)) {
        console.log(`[Cache] HIT for ${cacheKey}`);
        return cache.get(cacheKey);
    }
    console.log(`[Cache] MISS for ${cacheKey}`);

    const apiKey = process.env.HUD_API_KEY;
    if (!apiKey) {
        throw new Error("HUD_API_KEY environment variable not set.");
    }

    const stateAbbr = getStateAbbreviation(state);
    if (!stateAbbr) {
        throw new Error(`State not found: ${state}`);
    }

    // Remove the problematic 'updated' query parameter
    const countiesResponse = await fetch(`${API_BASE_URL}/fmr/listCounties/${stateAbbr}?year=${year}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });

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
    
    const foundCounty = countiesList.find((c: Record<string, unknown>) => {
        if (!c) return false;
        const countyName = c.county_name || c.cntyname; // Check both properties
        return countyName && typeof countyName === 'string' && countyName.toLowerCase().startsWith(county.toLowerCase());
    });
    if (!foundCounty) {
        throw new Error(`County '${county}' not found in ${state}.`);
    }
    
    const fipsCode = foundCounty.fips_code;

    const incomeLimitsResponse = await fetch(`${API_BASE_URL}/mtspil/data/${fipsCode}?year=${year}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!incomeLimitsResponse.ok) {
        const errorText = await incomeLimitsResponse.text();
        throw new Error(`Failed to fetch income limits for FIPS code ${fipsCode}: ${incomeLimitsResponse.statusText}. Details: ${errorText}`);
    }

    const incomeLimitsData = await incomeLimitsResponse.json();
    
    // Store in cache
    cache.set(cacheKey, incomeLimitsData.data);

    return incomeLimitsData.data;
}

/**
 * Calculate LIHTC maximum rents from income limits
 * LIHTC max rents are typically 30% of the income limit divided by 12 months
 */
export function calculateLihtcMaxRents(incomeLimitsData: Record<string, Record<string, number>>) {
    const maxRents: { [key: string]: { [key: string]: number } } = {};
    
    // Standard bedroom counts and corresponding family sizes
    const bedroomToFamilySize = {
        'studio': 1,    // Studio/efficiency
        '1br': 1,       // 1 bedroom
        '2br': 2,       // 2 bedroom  
        '3br': 3,       // 3 bedroom
        '4br': 4,       // 4 bedroom
        '5br': 5,       // 5 bedroom
    };
    
    // AMI percentages commonly used in LIHTC
    const amiPercentages = ['30percent', '50percent', '60percent', '80percent'];
    
    for (const amiPercent of amiPercentages) {
        if (incomeLimitsData[amiPercent]) {
            maxRents[amiPercent] = {};
            
            for (const [bedroom, familySize] of Object.entries(bedroomToFamilySize)) {
                // Get the income limit for this family size at this AMI percentage
                const incomeLimitKey = `il${amiPercent.replace('percent', '')}_p${familySize}`;
                const incomeLimit = incomeLimitsData[amiPercent][incomeLimitKey];
                
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
export async function getComprehensiveRentData(county: string, state: string, year: number = 2024) {
    try {
        // Fetch income limits and FMR data in parallel
        const [incomeLimitsData, fmrData] = await Promise.all([
            getHudIncomeLimits(county, state, year),
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
            state
        };
    } catch (error) {
        console.error('Error fetching comprehensive rent data:', error);
        throw error;
    }
} 