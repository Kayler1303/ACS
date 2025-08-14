// src/app/api/properties/[id]/lihtc-rents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getComprehensiveRentData } from '@/services/hud';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const propertyId = req.nextUrl.pathname.split('/')[3];
    if (!propertyId) {
        return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
    }
    
    try {
        const property = await prisma.property.findUnique({
            where: { id: propertyId },
        });

        if (!property) {
            return NextResponse.json({ error: 'Property not found' }, { status: 404 });
        }

        const { county, state } = property;
        if (!county || !state) {
            return NextResponse.json({ error: 'Property is missing county or state information.' }, { status: 400 });
        }

        // Get year from query parameter or default to current year
        const requestedYear = parseInt(req.nextUrl.searchParams.get('year') || new Date().getFullYear().toString());
        
        let rentData;
        let actualYear = requestedYear;
        
        try {
            // Try to get rent data for the requested year
            rentData = await getComprehensiveRentData(county, state, requestedYear);
        } catch (error) {
            // If requested year fails, try previous year (HUD data usually published in April)
            const fallbackYear = requestedYear - 1;
            console.log(`Failed to fetch ${requestedYear} rent data, falling back to ${fallbackYear}:`, error);
            
            try {
                rentData = await getComprehensiveRentData(county, state, fallbackYear);
                actualYear = fallbackYear;
                console.log(`Successfully fetched ${fallbackYear} rent data as fallback`);
            } catch (fallbackError) {
                console.error(`Both ${requestedYear} and ${fallbackYear} failed:`, fallbackError);
                throw new Error(`Unable to fetch HUD rent data for ${requestedYear} or ${fallbackYear}. This may indicate the data hasn't been published yet or there's an API issue.`);
            }
        }

        // Include metadata about which year was actually used
        return NextResponse.json({
            ...rentData,
            _metadata: {
                requestedYear,
                actualYear,
                usedFallback: actualYear !== requestedYear,
                note: 'LIHTC max rents calculated as 30% of income limits divided by 12 months'
            }
        });

    } catch (error: unknown) {
        console.error(`Failed to fetch LIHTC rent data for property ${propertyId}:`, error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : 'An unexpected error occurred.') }, { status: 500 });
    }
} 