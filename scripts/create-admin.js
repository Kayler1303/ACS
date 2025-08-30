const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    const email = 'admin@apartmentcompliance.com'; // Change this to your desired admin email
    const password = 'Admin123!'; // Change this to a secure password
    const name = 'Admin User';
    const company = 'Apartment Compliance System';

    // Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email }
    });

    if (existingAdmin) {
      console.log('Admin user already exists:', existingAdmin.email);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email,
        password: hashedPassword,
        name,
        company,
        role: 'ADMIN',
        emailVerified: new Date(),
        updatedAt: new Date(),
      }
    });

    console.log('✅ Admin user created successfully!');
    console.log('Email:', admin.email);
    console.log('Name:', admin.name);
    console.log('Role:', admin.role);
    console.log('Company:', admin.company);
    console.log('\n🔐 Login Credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\n⚠️  IMPORTANT: Change the password after first login!');

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
