import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface VerificationEmailProps {
  verificationLink: string;
}

export const VerificationEmail = ({ verificationLink }: VerificationEmailProps) => (
  <Html>
    <Head />
    <Preview>Apartment Compliance Solutions Email Verification</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={heading}>Verify Your Email Address</Text>
        <Text style={paragraph}>
          Welcome to Apartment Compliance Solutions! Please click the button below to verify your
          email address and activate your account.
        </Text>
        <Section style={buttonContainer}>
          <Button style={button} href={verificationLink}>
            Verify Email
          </Button>
        </Section>
        <Text style={paragraph}>
          If the button above doesn't work, you can also copy and paste this link into your browser:
        </Text>
        <Text style={link}>{verificationLink}</Text>
        <Text style={paragraph}>
          This link will expire in 24 hours. If you did not sign up for an account, you can safely
          ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default VerificationEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const heading = {
  fontSize: '28px',
  fontWeight: 'bold',
  marginTop: '48px',
  textAlign: 'center' as const,
  color: '#0078C6', // brand-blue
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'left' as const,
  padding: '0 40px',
  color: '#525f7f',
};

const buttonContainer = {
  textAlign: 'center' as const,
  padding: '20px 0',
};

const button = {
  backgroundColor: '#0078C6', // brand-blue
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};

const link = {
  color: '#20BBFF', // brand-accent
  fontSize: '14px',
  padding: '0 40px',
  wordBreak: 'break-all' as const,
}; 