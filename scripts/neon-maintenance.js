const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function neonMaintenance() {
  try {
    console.log('🧹 Running Neon-Compatible Database Maintenance...\n');

    // Run VACUUM (allowed in Neon)
    console.log('🧽 Running VACUUM...');
    try {
      await prisma.$queryRaw`VACUUM;`;
      console.log('✅ VACUUM completed');
    } catch (error) {
      console.log('❌ VACUUM failed (this is normal in managed services):', error.message);
    }

    // Run ANALYZE (allowed in Neon)
    console.log('\n📊 Running ANALYZE...');
    try {
      await prisma.$queryRaw`ANALYZE;`;
      console.log('✅ ANALYZE completed');
    } catch (error) {
      console.log('❌ ANALYZE failed:', error.message);
    }

    // Get current database size
    console.log('\n📏 Current Database Size:');
    try {
      const dbSize = await prisma.$queryRaw`
        SELECT
          pg_size_pretty(pg_database_size(current_database())) as database_size,
          pg_database_size(current_database()) as database_bytes;
      `;
      console.table(dbSize);
    } catch (error) {
      console.log('Error getting database size:', error.message);
    }

    console.log('\n💡 RECOMMENDATIONS:');
    console.log('========================================');
    console.log('✅ WAL will naturally reduce over time');
    console.log('✅ Neon automatically manages storage cleanup');
    console.log('✅ Consider upgrading to paid plan for more control');
    console.log('✅ Monitor usage in Neon dashboard');
    console.log('✅ Contact Neon support if storage stays high');

  } catch (error) {
    console.error('❌ Error in maintenance:', error);
  } finally {
    await prisma.$disconnect();
  }
}

neonMaintenance();






