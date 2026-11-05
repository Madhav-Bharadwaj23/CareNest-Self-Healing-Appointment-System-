
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

async function repair() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection.db;

    if (db.databaseName !== 'hospital') {
      throw new Error('Wrong database. Stopping without changes.');
    }

    const collection = db.collection('appointments');

    const cursor = collection.find({
      $or: [
        { bookingId: { $exists: false } },
        { bookingId: null },
        { bookingId: '' },
        { requestId: { $exists: false } },
        { requestId: null },
        { requestId: '' }
      ]
    });

    let updated = 0;

    for await (const doc of cursor) {
      const fields = {};

      if (!doc.bookingId) {
        fields.bookingId = `CN-${doc._id.toString()}`;
      }

      if (!doc.requestId) {
        fields.requestId = `REQ-${crypto.randomUUID()}`;
      }

      if (Object.keys(fields).length > 0) {
        const result = await collection.updateOne(
          { _id: doc._id },
          { $set: fields }
        );

        updated += result.modifiedCount;
      }
    }

    console.log('Database:', db.databaseName);
    console.log('Records updated:', updated);

    const remaining = await collection.countDocuments({
      $or: [
        { bookingId: { $exists: false } },
        { bookingId: null },
        { bookingId: '' },
        { requestId: { $exists: false } },
        { requestId: null },
        { requestId: '' }
      ]
    });

    console.log('Records still missing IDs:', remaining);
  } catch (error) {
    console.error('Repair failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

repair();
