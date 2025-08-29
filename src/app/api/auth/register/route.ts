import { prisma } from '@/lib/prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
import { Resend } from 'resend';
import VerificationEmail from '@/emails/VerificationEmail';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(email: string, name: string, token: string) {
  const verificationLink = `${process.env.NEXT_PUBLIC_BASE_URL}/api/verify-email?token=${token}`;
  
  console.log('🔍 [EMAIL SEND] Starting email send process');
  console.log('🔍 [EMAIL SEND] Verification link:', verificationLink);
  console.log('🔍 [EMAIL SEND] Resend API key present:', !!process.env.RESEND_API_KEY);
  
  try {
    console.log('🔍 [EMAIL SEND] Calling resend.emails.send...');
    const result = await resend.emails.send({
      from: 'registration@apartmentcompliance.com',
      to: email,
      subject: 'Welcome to Apartment Compliance Solutions! Please Verify Your Email',
      react: VerificationEmail({ verificationLink }),
    });
    console.log('✅ [EMAIL SEND] Email sent successfully:', result);
    return { success: true };
  } catch (error) {
    console.error('❌ [EMAIL SEND] Error sending verification email:', error);
    return { success: false };
  }
}

export async function POST(req: Request) {
  try {
    console.log('🔍 [REGISTER DEBUG] Starting registration process');
    const { name, company, email, password } = await req.json();
    console.log('🔍 [REGISTER DEBUG] Registration data received:', { name, company, email, passwordLength: password?.length });

    if (!name || !email || !password || !company) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    console.log('🔍 [REGISTER DEBUG] Checking for existing user...');
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      console.log('❌ [REGISTER DEBUG] User already exists');
      return NextResponse.json({ message: 'User with this email already exists' }, { status: 409 });
    }

    console.log('🔍 [REGISTER DEBUG] Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log('🔍 [REGISTER DEBUG] Generating verification token...');
    const verificationToken = randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 3600 * 1000); // Token expires in 1 hour

    console.log('🔍 [REGISTER DEBUG] Creating user in database...');
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        name,
        company,
        email,
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });

    console.log('🔍 [REGISTER DEBUG] Creating verification token...');
    await prisma.verificationToken.create({
        data: {
            identifier: user.id,
            token: verificationToken,
            expires: tokenExpiry,
        }
    });

    console.log('🔍 [REGISTER DEBUG] Sending verification email...');
    const emailSent = await sendVerificationEmail(email, name, verificationToken);

    if (!emailSent.success) {
      console.log('❌ [REGISTER DEBUG] Failed to send verification email');
      return NextResponse.json({ message: 'User created but failed to send verification email.' }, { status: 500 });
    }

    console.log('✅ [REGISTER DEBUG] Registration completed successfully');
    return NextResponse.json({ message: 'User created successfully. Please check your email to verify your account.' }, { status: 201 });

  } catch (error: unknown) {
    console.error('❌ [REGISTER DEBUG] Registration error:', error);
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ message: 'User with this email already exists' }, { status: 409 });
      }
    }
    return NextResponse.json({ message: 'An unexpected error occurred.' }, { status: 500 });
  }
} 