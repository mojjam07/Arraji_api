// Script to query applications from the database
const { sequelize, Application } = require('./models');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    const apps = await Application.findAll({
      attributes: ['id', 'applicationNumber', 'status', 'userId', 'visaType', 'createdAt']
    });

    console.log('Found', apps.length, 'applications:');
    console.log(JSON.stringify(apps.map(a => a.toJSON()), null, 2));

    await sequelize.close();
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
})();

