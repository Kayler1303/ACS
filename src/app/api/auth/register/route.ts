import { prisma } from '@/lib/prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { Resend } from 'resend';
import VerificationEmail from '@/emails/VerificationEmail';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(email: string, name: string, token: string) {
  const verificationLink = `${process.env.NEXT_PUBLIC_BASE_URL}/api/verify-email?token=${token}`;
  
  try {
    await resend.emails.send({
      from: 'registration@apartmentcompliance.com',
      to: email,
      subject: 'Welcome to Apartment Compliance Solutions! Please Verify Your Email',
      react: VerificationEmail({ verificationLink }),
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending verification email:', error);
    return { success: false };
  }
}

export async function POST(req: Request) {
  try {
    const { name, company, email, password } = await req.json();

    if (!name || !email || !password || !company) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return NextResponse.json({ message: 'User with this email already exists' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const verificationToken = randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 3600 * 1000); // Token expires in 1 hour

    const user = await prisma.user.create({
      data: {
        name,
        company,
        email,
        password: hashedPassword,
      },
    });

    await prisma.verificationToken.create({
        data: {
            identifier: user.id,
            token: verificationToken,
            expires: tokenExpiry,
        }
    });

    const emailSent = await sendVerificationEmail(email, name, verificationToken);

    if (!emailSent.success) {
      return NextResponse.json({ message: 'User created but failed to send verification email.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'User created successfully. Please check your email to verify your account.' }, { status: 201 });

  } catch (error: any) {
    console.error('Registration error:', error);
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ message: 'User with this email already exists' }, { status: 409 });
      }
    }
    return NextResponse.json({ message: 'An unexpected error occurred.' }, { status: 500 });
  }
} 