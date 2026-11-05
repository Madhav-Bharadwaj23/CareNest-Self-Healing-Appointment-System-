
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

  consultationFee: {
    type: Number,
    default: 0,
    min: 0
  },

  paymentMethod: {
    type: String,
    enum: ['counter', 'online', 'direct_upi', 'none'],
    default: 'none'
  },

  paymentStatus: {
    type: String,
    enum: ['not_requested', 'pending', 'paid', 'patient_confirmed', 'doctor_verified'],
    default: 'not_requested'
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
