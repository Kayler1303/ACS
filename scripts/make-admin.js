const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function makeUserAdmin(email) {
  try {
    console.log(`Looking for user with email: ${email}`);
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true }
    });

    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      return;
    }

    console.log(`Found user: ${user.name || user.email} (current role: ${user.role || 'USER'})`);

    if (user.role === 'ADMIN') {
      console.log(`✅ User ${user.email} is already an admin`);
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
      select: { id: true, email: true, name: true, role: true }
    });

    console.log(`✅ Successfully promoted ${updatedUser.email} to admin!`);
    console.log(`User details:`, {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role
    });

  } catch (error) {
    console.error('❌ Error making user admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
  console.error('❌ Please provide an email address');
  console.log('Usage: node scripts/make-admin.js your-email@example.com');
  process.exit(1);
}

makeUserAdmin(email); 