// src/app/api/properties/[id]/income-limits/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getHudIncomeLimits } from '@/services/hud';

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
        
        let incomeLimits;
        let actualYear = requestedYear;
        
        try {
            // Try to get limits for the requested year
            incomeLimits = await getHudIncomeLimits(county, state, requestedYear);
        } catch (error) {
            // If requested year fails, try previous year (HUD limits usually published in April)
            const fallbackYear = requestedYear - 1;
            console.log(`Failed to fetch ${requestedYear} limits, falling back to ${fallbackYear}:`, error);
            
            try {
                incomeLimits = await getHudIncomeLimits(county, state, fallbackYear);
                actualYear = fallbackYear;
                console.log(`Successfully fetched ${fallbackYear} limits as fallback`);
            } catch (fallbackError) {
                console.error(`Both ${requestedYear} and ${fallbackYear} failed:`, fallbackError);
                throw new Error(`Unable to fetch HUD income limits for ${requestedYear} or ${fallbackYear}. This may indicate the limits haven't been published yet or there's an API issue.`);
            }
        }

        // Include metadata about which year was actually used
        return NextResponse.json({
            ...incomeLimits,
            _metadata: {
                requestedYear,
                actualYear,
                usedFallback: actualYear !== requestedYear
            }
        });

    } catch (error: unknown) {
        console.error(`Failed to fetch income limits for property ${propertyId}:`, error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : 'An unexpected error occurred.') }, { status: 500 });
    }
}