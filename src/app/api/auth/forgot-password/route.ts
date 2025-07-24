import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { Resend } from 'resend';
import PasswordResetEmail from '@/emails/PasswordResetEmail';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendPasswordResetEmail(email: string, token: string) {
  const resetLink = `${process.env.NEXT_PUBLIC_BASE_URL}/auth/reset-password?token=${token}`;
  
  try {
    await resend.emails.send({
      from: 'password-reset@apartmentcompliance.com',
      to: email,
      subject: 'Reset Your Password',
      react: PasswordResetEmail({ resetLink }),
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false };
  }
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ message: 'Email is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // To prevent email enumeration, we send a success response even if the user doesn't exist.
      return NextResponse.json({ message: 'If an account with this email exists, a password reset link has been sent.' }, { status: 200 });
    }

    const passwordResetToken = randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 3600 * 1000); // Token expires in 1 hour

    // We can reuse the VerificationToken model for password resets for simplicity.
    // In a larger application, you might want a separate model.
    await prisma.verificationToken.create({
        data: {
            identifier: user.id,
            token: passwordResetToken,
            expires: tokenExpiry,
        }
    });

    const emailSent = await sendPasswordResetEmail(email, passwordResetToken);

    if (!emailSent.success) {
      return NextResponse.json({ message: 'Failed to send password reset email.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'If an account with this email exists, a password reset link has been sent.' }, { status: 200 });

  } catch (error: unknown) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ message: 'An unexpected error occurred.' }, { status: 500 });
  }
} 