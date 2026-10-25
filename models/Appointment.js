
const mongoose = require('mongoose');
const crypto = require('crypto');

const schema = new mongoose.Schema({
  bookingId: {
    type: String,
    unique: true,
    required: true,
    default: () => `CN-${crypto.randomUUID()}`
  },

  requestId: {
    type: String,
    unique: true,
    required: true,
    default: () => crypto.randomUUID()
  },

  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },

  patientName: {
    type: String,
    required: true,
    trim: true
  },

  relationship: {
    type: String,
    default: 'Self'
  },

  appointmentDate: {
    type: Date,
    required: true
  },

  tokenNumber: {
    type: Number
  },

  reason: {
    type: String,
    default: 'General consultation'
  },

  status: {
    type: String,
    enum: ['booked', 'cancelled', 'completed'],
    default: 'booked'
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Appointment', schema);
