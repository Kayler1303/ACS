const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedAnalytics() {
  try {
    console.log('🌱 Seeding analytics data...');

    // Get existing users
    const users = await prisma.user.findMany({
      select: { id: true, email: true }
    });

    if (users.length === 0) {
      console.log('❌ No users found. Please create users first.');
      return;
    }

    console.log(`Found ${users.length} users. Creating sample analytics data...`);

    const activities = [];
    const now = new Date();

    // Create sample login activities for the past 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      // Create 1-3 login activities per day
      const loginCount = Math.floor(Math.random() * 3) + 1;

      for (let j = 0; j < loginCount; j++) {
        const randomUser = users[Math.floor(Math.random() * users.length)];
        const loginTime = new Date(date);
        loginTime.setHours(Math.floor(Math.random() * 24));
        loginTime.setMinutes(Math.floor(Math.random() * 60));

        activities.push({
          userId: randomUser.id,
          activityType: 'LOGIN',
          description: 'User logged in successfully',
          metadata: {
            loginMethod: 'credentials',
            userAgent: 'web-app'
          },
          ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          createdAt: loginTime
        });
      }
    }

    // Add some page view activities
    const pages = ['Dashboard', 'Property List', 'Analytics', 'Account'];
    for (let i = 0; i < 100; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const pageViewTime = new Date(now);
      pageViewTime.setDate(pageViewTime.getDate() - Math.floor(Math.random() * 30));
      pageViewTime.setHours(Math.floor(Math.random() * 24));

      activities.push({
        userId: randomUser.id,
        activityType: 'PAGE_VIEW',
        description: `Viewed ${pages[Math.floor(Math.random() * pages.length)]}`,
        metadata: {
          page: pages[Math.floor(Math.random() * pages.length)],
          referrer: 'dashboard'
        },
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        createdAt: pageViewTime
      });
    }

    // Add some property view activities
    for (let i = 0; i < 50; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const propertyViewTime = new Date(now);
      propertyViewTime.setDate(propertyViewTime.getDate() - Math.floor(Math.random() * 30));

      activities.push({
        userId: randomUser.id,
        activityType: 'PROPERTY_VIEW',
        description: `Viewed property details`,
        metadata: {
          propertyId: `prop_${Math.floor(Math.random() * 100)}`,
          propertyName: `Property ${Math.floor(Math.random() * 100)}`
        },
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        createdAt: propertyViewTime
      });
    }

    // Create activities in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < activities.length; i += batchSize) {
      const batch = activities.slice(i, i + batchSize);
      await prisma.userActivity.createMany({
        data: batch,
        skipDuplicates: true
      });
      console.log(`Created ${Math.min(i + batchSize, activities.length)}/${activities.length} activities...`);
    }

    console.log('✅ Successfully seeded analytics data!');
    console.log(`📊 Created ${activities.length} sample activities`);
    console.log('🔄 Analytics dashboard should now show data');

  } catch (error) {
    console.error('❌ Error seeding analytics data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedAnalytics();
