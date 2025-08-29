import { NextResponse } from 'next/server';

export async function GET() {
  console.log('🔍 [DEBUG TEST] Test endpoint reached successfully');
  
  return NextResponse.json({
    message: 'Debug test endpoint working',
    timestamp: new Date().toISOString(),
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
    deployment: 'acs-gjqi39o1s-kayler1303-47fb65f4.vercel.app'
  });
}
