import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/auth/verification-failed?error=notoken', req.nextUrl.origin));
  }

  try {
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken || verificationToken.expires < new Date()) {
      return NextResponse.redirect(new URL('/auth/verification-failed?error=invalid', req.nextUrl.origin));
    }

    // Mark user as verified using the identifier from the token
    await prisma.user.update({
      where: { id: verificationToken.identifier },
      data: { emailVerified: new Date() },
    });

    // Delete the token so it cannot be used again
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: verificationToken.identifier,
          token: verificationToken.token,
        },
      },
    });

    // Redirect to a success page
    return NextResponse.redirect(new URL('/auth/verification-success', req.nextUrl.origin));

  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.redirect(new URL('/auth/verification-failed?error=server', req.nextUrl.origin));
  }
} 