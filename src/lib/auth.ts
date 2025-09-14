import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        console.log('🔍 [AUTH DEBUG] Authorize called with:', { 
          email: credentials?.email, 
          hasPassword: !!credentials?.password 
        });

        if (!credentials?.email || !credentials?.password) {
          console.log('🚨 [AUTH DEBUG] Missing credentials');
          return null;
        }

        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          console.log('🔍 [AUTH DEBUG] User lookup result:', { 
            found: !!user, 
            emailVerified: user?.emailVerified 
          });

          if (!user) {
            console.log('🚨 [AUTH DEBUG] User not found');
            return null;
          }

          if (!user.emailVerified) {
            console.log('🚨 [AUTH DEBUG] Email not verified');
            throw new Error('Please verify your email address before logging in.');
          }
        } catch (error) {
          console.error('🚨 [AUTH DEBUG] Database error:', error);
          return null;
        }

        if (user.suspended) {
          console.log('🚨 [AUTH DEBUG] User is suspended');
          throw new Error('Your account has been suspended. Please contact support for assistance.');
        }

        console.log('🔍 [AUTH DEBUG] Checking password...');
        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        console.log('🔍 [AUTH DEBUG] Password valid:', isPasswordValid);

        if (!isPasswordValid) {
          console.log('🚨 [AUTH DEBUG] Invalid password');
          return null;
        }

        // Log successful login
        try {
          await prisma.userActivity.create({
            data: {
              userId: user.id,
              activityType: 'LOGIN',
              description: 'User logged in successfully',
              metadata: {
                loginMethod: 'credentials',
                userAgent: 'web-app'
              }
            }
          });
        } catch (error) {
          console.error('Failed to log login activity:', error);
          // Don't fail the login if activity logging fails
        }

        console.log('✅ [AUTH DEBUG] Authentication successful for user:', user.email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          company: user.company,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
}; 