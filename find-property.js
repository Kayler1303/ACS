const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findProperty() {
  try {
    console.log('🔍 Looking for properties...\n');
    
    const properties = await prisma.property.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        numberOfUnits: true
      },
      take: 5
    });

    console.log(`Found ${properties.length} properties:`);
    properties.forEach((p, i) => {
      console.log(`${i + 1}. ${p.name} (${p.numberOfUnits} units) - ID: ${p.id}`);
    });

    if (properties.length > 0) {
      const propertyId = properties[0].id;
      console.log(`\n🔍 Checking units for property: ${properties[0].name}\n`);

      const units = await prisma.unit.findMany({
        where: { propertyId },
        select: {
          unitNumber: true,
          id: true
        },
        orderBy: { unitNumber: 'asc' },
        take: 10
      });

      console.log(`Units found: ${units.map(u => u.unitNumber).join(', ')}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findProperty();
