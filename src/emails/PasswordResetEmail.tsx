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

interface PasswordResetEmailProps {
  resetLink?: string;
}

export const PasswordResetEmail = ({
  resetLink = 'https://apartmentcompliance.com',
}: PasswordResetEmailProps) => (
  <Html>
    <Head />
    <Preview>Reset your password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={h1}>Reset Your Password</Text>
        <Text style={text}>
          Someone recently requested a password change for your account. If this was you, you can set a new password here:
        </Text>
        <Section style={{ textAlign: 'center' }}>
          <Button
            style={button}
            href={resetLink}
          >
            Reset Password
          </Button>
        </Section>
        <Text style={text}>
          If you don&apos;t want to change your password or didn&apos;t request this, just ignore and delete this message.
        </Text>
        <Text style={text}>
          To keep your account secure, please don&apos;t forward this email to anyone.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default PasswordResetEmail;

const main = {
  backgroundColor: '#f6f9fc',
  padding: '20px',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #f0f0f0',
  borderRadius: '5px',
  padding: '45px',
  margin: '0 auto',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '30px 0',
};

const text = {
  color: '#555',
  fontSize: '16px',
  lineHeight: '24px',
};

const button = {
  backgroundColor: '#007bff',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '100%',
  padding: '12px 20px',
}; 