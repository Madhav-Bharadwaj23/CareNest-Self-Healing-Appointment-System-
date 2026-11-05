
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 18
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['patient', 'doctor', 'admin'],
    default: 'patient'
  },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', schema);
