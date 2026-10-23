
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const collection = mongoose.connection.db.collection('appointments');

    const indexName = 'unique_booked_doctor_timeslot';

    const existingIndexes = await collection.indexes();

    if (existingIndexes.some(index => index.name === indexName)) {
      console.log('Unique appointment index already exists.');
      return;
    }

    const result = await collection.createIndex(
      { doctorId: 1, appointmentDate: 1 },
      {
        unique: true,
        partialFilterExpression: { status: 'booked' },
        name: indexName
      }
    );

    console.log('SUCCESS: Database duplicate protection added.');
    console.log('Index:', result);
  } catch (error) {
    console.error('INDEX CREATION FAILED:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

main();
