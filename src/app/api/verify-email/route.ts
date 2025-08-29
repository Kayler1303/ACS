import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  
  console.log('🔍 [EMAIL VERIFICATION] Starting verification process');
  console.log('🔍 [EMAIL VERIFICATION] Request URL:', req.nextUrl.toString());
  console.log('🔍 [EMAIL VERIFICATION] Token received:', token ? 'YES' : 'NO');
  console.log('🔍 [EMAIL VERIFICATION] Token value:', token);

  if (!token) {
    console.log('❌ [EMAIL VERIFICATION] No token provided');
    return NextResponse.redirect(new URL('/auth/verification-failed?error=notoken', req.nextUrl.origin));
  }

  try {
    console.log('🔍 [EMAIL VERIFICATION] Looking up verification token in database...');
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    console.log('🔍 [EMAIL VERIFICATION] Token lookup result:', verificationToken ? 'FOUND' : 'NOT FOUND');
    
    if (verificationToken) {
      console.log('🔍 [EMAIL VERIFICATION] Token details:', {
        identifier: verificationToken.identifier,
        expires: verificationToken.expires.toISOString(),
        now: new Date().toISOString(),
        isExpired: verificationToken.expires < new Date()
      });
    }

    if (!verificationToken || verificationToken.expires < new Date()) {
      console.log('❌ [EMAIL VERIFICATION] Token invalid or expired');
      return NextResponse.redirect(new URL('/auth/verification-failed?error=invalid', req.nextUrl.origin));
    }

    // Mark user as verified using the identifier from the token
    console.log('🔍 [EMAIL VERIFICATION] Updating user verification status...');
    const updatedUser = await prisma.user.update({
      where: { id: verificationToken.identifier },
      data: { emailVerified: new Date() },
    });
    console.log('✅ [EMAIL VERIFICATION] User marked as verified:', {
      userId: updatedUser.id,
      email: updatedUser.email,
      emailVerified: updatedUser.emailVerified?.toISOString()
    });

    // Delete the token so it cannot be used again
    console.log('🔍 [EMAIL VERIFICATION] Deleting verification token...');
    await prisma.verificationToken.delete({
      where: { token: verificationToken.token },
    });
    console.log('✅ [EMAIL VERIFICATION] Token deleted successfully');

    // Redirect to a success page
    const successUrl = new URL('/auth/verification-success', req.nextUrl.origin);
    console.log('✅ [EMAIL VERIFICATION] Verification successful, redirecting to:', successUrl.toString());
    return NextResponse.redirect(successUrl);

  } catch (error) {
    console.error('❌ [EMAIL VERIFICATION] Verification error:', error);
    return NextResponse.redirect(new URL('/auth/verification-failed?error=server', req.nextUrl.origin));
  }
}

// Handle HEAD requests (browser preflight checks)
export async function HEAD(req: NextRequest) {
  console.log('🔍 [EMAIL VERIFICATION] HEAD request received');
  return new NextResponse(null, { status: 200 });
} 