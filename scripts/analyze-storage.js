const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function analyzeStorage() {
  try {
    console.log('🔍 Analyzing Database Storage Usage...\n');

    // Get total database size first
    console.log('💾 Total Database Size:');
    try {
      const dbSize = await prisma.$queryRaw`
        SELECT
          pg_size_pretty(pg_database_size(current_database())) as total_size,
          pg_database_size(current_database()) as total_bytes;
      `;
      console.table(dbSize);
    } catch (error) {
      console.log('Error getting database size:', error.message);
    }

    // Get all tables and their sizes
    console.log('\n📊 All Tables in Database:');
    try {
      const allTables = await prisma.$queryRaw`
        SELECT
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          pg_total_relation_size(schemaname||'.'||tablename) as bytes
        FROM pg_tables
        WHERE schemaname IN ('public', 'pg_catalog')
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 20;
      `;

      if (allTables.length > 0) {
        console.table(allTables);
      } else {
        console.log('No tables found.');
      }
    } catch (error) {
      console.log('Error getting table sizes:', error.message);
    }

    // Check our specific application tables
    console.log('\n📈 Application Data:');
    const appTables = ['user', 'useractivity'];

    for (const table of appTables) {
      try {
        const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM ${table};`);
        console.log(`${table}: ${count[0].count} rows`);
      } catch (error) {
        console.log(`${table}: Table doesn't exist or is empty`);
      }
    }

    // Check for any large objects
    console.log('\n📦 Large Objects Check:');
    try {
      const loCount = await prisma.$queryRaw`
        SELECT COUNT(*) as large_object_count FROM pg_largeobject_metadata;
      `;
      console.log(`Large objects: ${loCount[0].large_object_count}`);
    } catch (error) {
      console.log('Error checking large objects:', error.message);
    }

  } catch (error) {
    console.error('❌ Error analyzing storage:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeStorage();
