
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    unique: true,
    sparse: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  specialty: {
    type: String,
    required: true,
    trim: true
  },

  education: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },

  imageUrl: {
    type: String,
    default: ''
  },

  profileImage: {
    type: String,
    default: ''
  },

  experience: {
    type: Number,
    default: 0
  },

  // Existing availability text; kept for compatibility
  availability: {
    type: String,
    default: 'Please contact reception'
  },

  // Structured schedule fields
  workingDays: {
    type: [{
      type: String,
      enum: [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday'
      ]
    }],
    default: []
  },

  startTime: {
    type: String,
    default: ''
  },

  endTime: {
    type: String,
    default: ''
  },

  slotTimes: {
    type: [String],
    default: []
  },

  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Doctor', schema);
