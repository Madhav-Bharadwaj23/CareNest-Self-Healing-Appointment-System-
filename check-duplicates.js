
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const collection = mongoose.connection.db.collection('appointments');

    const duplicates = await collection.aggregate([
      { $match: { status: 'booked' } },
      {
        $group: {
          _id: {
            doctorId: '$doctorId',
            appointmentDate: '$appointmentDate'
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    console.log('DUPLICATE BOOKED SLOTS:');
    console.log(JSON.stringify(duplicates, null, 2));
  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

main();
