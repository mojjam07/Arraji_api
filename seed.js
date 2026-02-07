/**
 * Seed Script - Creates admin, users, and sample applications for testing
 * Run with: node backend/seed.js
**/

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User, Application } = require('./models');

const seedTestData = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    // Note: Database sync is handled by migrations in production
    // Only sync in development if tables don't exist yet
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('Database synced (development mode)');
    } else {
      console.log('Database tables ready (migrations already applied)');
    }

    // Define the allowed users
    const allowedUsers = [
      { email: 'admin@arraji.com', password: 'Arraji01', role: 'admin', firstName: 'Admin', lastName: 'User' },
      { email: 'user@arraji.com', password: 'User123@', role: 'user', firstName: 'Regular', lastName: 'User' }
    ];

    // Get all existing users
    const allUsers = await User.findAll();
    const existingEmails = allUsers.map(u => u.email);

    // Delete users that are not in the allowed list
    const emailsToDelete = existingEmails.filter(email => 
      !allowedUsers.some(allowed => allowed.email === email)
    );

    if (emailsToDelete.length > 0) {
      const deletedCount = await User.destroy({
        where: { email: emailsToDelete }
      });
      console.log(`Removed ${deletedCount} user(s): ${emailsToDelete.join(', ')}`);
    }

    // Process each allowed user
    const userMap = {}; // Store user IDs by email for creating applications
    for (const userData of allowedUsers) {
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      const existingUser = await User.findOne({ where: { email: userData.email } });

      if (existingUser) {
        // Update existing user if needed
        const needsUpdate = 
          existingUser.role !== userData.role ||
          !existingUser.isActive ||
          !existingUser.isVerified;

        if (needsUpdate) {
          await existingUser.update({
            role: userData.role,
            isActive: true,
            isVerified: true
          });
          console.log(`User updated: ${userData.email}`);
        }
        userMap[userData.email] = existingUser.id;
      } else {
        // Create new user
        const newUser = await User.create({
          email: userData.email,
          password: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          isActive: true,
          isVerified: true
        });
        console.log(`User created: ${userData.email}`);
        userMap[userData.email] = newUser.id;
      }
    }

    // Create sample applications for testing
    const sampleApplications = [
      {
        userId: userMap['user@arraji.com'],
        visaType: 'tourist',
        applicationNumber: 'VISA-2024-001',
        status: 'submitted',
        destinationCountry: 'UAE',
        firstName: 'John',
        lastName: 'Smith',
        purposeOfVisit: 'Tourism and leisure travel',
        intendedDateOfArrival: new Date('2024-03-01'),
        intendedDateOfDeparture: new Date('2024-03-15'),
        durationOfStay: 14,
        portOfEntry: 'Dubai International Airport',
        priority: 'high'
      },
      {
        userId: userMap['user@arraji.com'],
        visaType: 'business',
        applicationNumber: 'VISA-2024-002',
        status: 'under_review',
        destinationCountry: 'UK',
        firstName: 'Sarah',
        lastName: 'Johnson',
        purposeOfVisit: 'Business meeting with clients',
        intendedDateOfArrival: new Date('2024-02-20'),
        intendedDateOfDeparture: new Date('2024-02-25'),
        durationOfStay: 5,
        portOfEntry: 'Heathrow Airport',
        priority: 'high'
      },
      {
        userId: userMap['user@arraji.com'],
        visaType: 'student',
        applicationNumber: 'VISA-2024-003',
        status: 'documents_required',
        destinationCountry: 'Canada',
        firstName: 'Michael',
        lastName: 'Brown',
        purposeOfVisit: 'Study at University of Toronto',
        intendedDateOfArrival: new Date('2024-09-01'),
        intendedDateOfDeparture: new Date('2027-08-31'),
        durationOfStay: 1095,
        portOfEntry: 'Toronto Pearson Airport',
        priority: 'medium'
      },
      {
        userId: userMap['user@arraji.com'],
        visaType: 'work',
        applicationNumber: 'VISA-2024-004',
        status: 'biometrics_scheduled',
        destinationCountry: 'Australia',
        firstName: 'Emily',
        lastName: 'Davis',
        purposeOfVisit: 'Work permit for IT consulting',
        intendedDateOfArrival: new Date('2024-04-01'),
        intendedDateOfDeparture: new Date('2025-03-31'),
        durationOfStay: 365,
        portOfEntry: 'Sydney Airport',
        priority: 'high'
      },
      {
        userId: userMap['user@arraji.com'],
        visaType: 'tourist',
        applicationNumber: 'VISA-2024-005',
        status: 'approved',
        destinationCountry: 'Japan',
        firstName: 'David',
        lastName: 'Wilson',
        purposeOfVisit: 'Cherry blossom viewing',
        intendedDateOfArrival: new Date('2024-04-05'),
        intendedDateOfDeparture: new Date('2024-04-20'),
        durationOfStay: 15,
        portOfEntry: 'Narita Airport',
        priority: 'low'
      },
      {
        userId: userMap['user@arraji.com'],
        visaType: 'business',
        applicationNumber: 'VISA-2024-006',
        status: 'completed',
        destinationCountry: 'Germany',
        firstName: 'Lisa',
        lastName: 'Anderson',
        purposeOfVisit: 'Conference attendance',
        intendedDateOfArrival: new Date('2024-01-15'),
        intendedDateOfDeparture: new Date('2024-01-20'),
        durationOfStay: 5,
        portOfEntry: 'Frankfurt Airport',
        priority: 'medium'
      },
      {
        userId: userMap['user@arraji.com'],
        visaType: 'family',
        applicationNumber: 'VISA-2024-007',
        status: 'rejected',
        destinationCountry: 'USA',
        firstName: 'Robert',
        lastName: 'Taylor',
        purposeOfVisit: 'Family reunion',
        intendedDateOfArrival: new Date('2024-05-01'),
        intendedDateOfDeparture: new Date('2024-06-01'),
        durationOfStay: 30,
        portOfEntry: 'LAX Airport',
        priority: 'high',
        rejectionReason: 'Insufficient documentation for family relationship proof'
      },
      {
        userId: userMap['user@arraji.com'],
        visaType: 'transit',
        applicationNumber: 'VISA-2024-008',
        status: 'issued',
        destinationCountry: 'Singapore',
        firstName: 'Jennifer',
        lastName: 'Martinez',
        purposeOfVisit: 'Transit visa for connecting flight',
        intendedDateOfArrival: new Date('2024-03-10'),
        intendedDateOfDeparture: new Date('2024-03-12'),
        durationOfStay: 2,
        portOfEntry: 'Changi Airport',
        priority: 'low'
      }
    ];

    // Check existing applications
    const existingApps = await Application.findAll();

    // Create or update each sample application
    let appsCreated = 0;
    let appsUpdated = 0;
    
    for (const appData of sampleApplications) {
      const existingApp = await Application.findOne({ 
        where: { applicationNumber: appData.applicationNumber } 
      });

      if (existingApp) {
        await existingApp.update(appData);
        appsUpdated++;
      } else {
        await Application.create(appData);
        appsCreated++;
      }
    }

    // Display final state
    console.log('\nUser List:');
    const finalUsers = await User.findAll({
      attributes: ['id', 'email', 'role', 'isActive', 'isVerified']
    });
    finalUsers.forEach(user => {
      console.log(`   - ${user.email} [${user.role}]`);
    });

    console.log('\nApplication List:');
    const finalApplications = await Application.findAll({
      attributes: ['id', 'applicationNumber', 'visaType', 'status', 'firstName', 'lastName']
    });
    finalApplications.forEach(app => {
      console.log(`   - ${app.applicationNumber} [${app.visaType}] - ${app.status}`);
    });

    console.log('\nLogin Credentials:');
    console.log('   Admin: admin@arraji.com / Arraji01');
    console.log('   User:  user@arraji.com / User123@');

    console.log('\nSummary:');
    console.log(`   Users: ${finalUsers.length}`);
    console.log(`   Applications: ${finalApplications.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedTestData();

