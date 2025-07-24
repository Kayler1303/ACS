// src/app/api/hud-test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getComprehensiveRentData, getHudIncomeLimits } from '@/services/hud';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
        const state = searchParams.get('state');
        const county = searchParams.get('county');

        if (!state || !county) {
            return NextResponse.json({ error: 'state and county query parameters are required' }, { status: 400 });
        }

        // Get comprehensive rent data including LIHTC max rents
        const comprehensiveData = await getComprehensiveRentData(county, state, year);

        // Also get just the income limits for comparison
        const incomeLimitsData = await getHudIncomeLimits(county, state, year);

        // User is asking for: MTSP 50% income limit for a 2-person family
        const familySize = 2;
        
        // The key for a 2-person family at 50% AMI is 'il50_p2'
        const limitValue = incomeLimitsData?.['50percent']?.[`il50_p${familySize}`];

        // Example LIHTC max rent calculation for 2-bedroom (3-person family) at 50% AMI
        const lihtcMaxRent2Br50Percent = comprehensiveData.lihtcMaxRents?.['50percent']?.['2br'];

        if (limitValue !== null && limitValue !== undefined) {
            return NextResponse.json({
                county: county,
                state: state,
                year: year,
                // Original income limit example
                incomeLimit: {
                    program: "MTSP 50%",
                    familySize: `${familySize}-person`,
                    limit: `$${limitValue.toLocaleString()}`,
                },
                // New LIHTC max rents data
                lihtcMaxRents: {
                    note: "LIHTC max rents calculated as 30% of income limits / 12 months",
                    example: {
                        "2-bedroom_50_percent_AMI": lihtcMaxRent2Br50Percent ? `$${lihtcMaxRent2Br50Percent.toLocaleString()}` : 'Not available',
                    },
                    all: comprehensiveData.lihtcMaxRents
                },
                // Fair Market Rents for comparison (if available)
                fairMarketRents: comprehensiveData.fairMarketRents ? {
                    note: "HUD Fair Market Rents for comparison",
                    data: comprehensiveData.fairMarketRents
                } : 'Fair Market Rents not available',
                // Full raw data for debugging
                rawIncomeLimitsData: incomeLimitsData,
                comprehensiveRentData: comprehensiveData
            });
        } else {
             return NextResponse.json({ 
                error: `Could not find MTSP 50% income limit for a ${familySize}-person family.`,
                rawData: incomeLimitsData,
                comprehensiveData: comprehensiveData
            }, { status: 404 });
        }

    } catch (error: unknown) {
        console.error('HUD test route error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'An unexpected error occurred' }, { status: 500 });
    }
} 