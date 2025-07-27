const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Import the auto-override function (we'll simulate it since import doesn't work in Node scripts)
async function createAutoOverrideRequest(params) {
  const {
    type,
    unitId,
    userId,
    systemExplanation
  } = params;

  try {
    // Check if a similar override request already exists and is pending
    const existingRequest = await prisma.overrideRequest.findFirst({
      where: {
        type,
        status: 'PENDING',
        unitId: unitId || null,
      }
    });

    // Don't create duplicate requests
    if (existingRequest) {
      console.log(`Auto-override request already exists for ${type}:`, existingRequest.id);
      return existingRequest;
    }

    console.log(`Creating auto-override request for ${type}:`, {
      unitId,
      systemExplanation
    });

    const overrideRequest = await prisma.overrideRequest.create({
      data: {
        type,
        userExplanation: systemExplanation,
        unitId: unitId || null,
        requesterId: userId, // We'll use a dummy user ID
        status: 'PENDING'
      },
      include: { 
        requester: { 
          select: { id: true, name: true, email: true, company: true } 
        } 
      }
    });

    console.log(`Auto-override request created:`, overrideRequest.id);
    return overrideRequest;

  } catch (error) {
    console.error('Error creating auto-override request:', error);
    throw error;
  }
}

async function testAutoOverride() {
  try {
    console.log('🧪 Testing auto-override system for Unit 0101...\n');
    
    // Get a user ID (we'll use the first user we find)
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log('❌ No users found in database');
      return;
    }
    
    console.log(`👤 Using user: ${user.name} (${user.email})`);
    
    // Find unit 0101
    const unit0101 = await prisma.unit.findFirst({
      where: { 
        unitNumber: '0101',
        property: { name: 'Jasmine Cove' }
      }
    });

    if (!unit0101) {
      console.log('❌ Unit 0101 not found');
      return;
    }

    console.log(`🏠 Found Unit 0101: ${unit0101.id}`);
    
    // Test creating an auto-override request
    console.log('\n🤖 Attempting to create auto-override request...');
    
    try {
      const request = await createAutoOverrideRequest({
        type: 'INCOME_DISCREPANCY',
        unitId: unit0101.id,
        userId: user.id,
        systemExplanation: `System detected income discrepancy for Unit ${unit0101.unitNumber}. Verified income does not match compliance income. Admin review required to resolve discrepancy.`
      });
      
      console.log('\n✅ Auto-override request created successfully!');
      console.log(`   Request ID: ${request.id}`);
      console.log(`   Type: ${request.type}`);
      console.log(`   Status: ${request.status}`);
      
    } catch (error) {
      console.log('\n❌ Failed to create auto-override request:');
      console.error(error.message);
    }

    // Check if request was created
    console.log('\n🔍 Checking for override requests in database...');
    const requests = await prisma.overrideRequest.findMany({
      where: { unitId: unit0101.id },
      include: { requester: { select: { name: true, email: true } } }
    });
    
    console.log(`Found ${requests.length} override request(s) for Unit 0101:`);
    requests.forEach((req, index) => {
      console.log(`${index + 1}. ${req.type} - ${req.status} (by ${req.requester.name})`);
    });

  } catch (error) {
    console.error('Error testing auto-override:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAutoOverride(); 