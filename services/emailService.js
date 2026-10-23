const nodemailer = require('nodemailer');

function createTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error('Email credentials are missing from .env');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
}

async function sendAppointmentEmail({ to, bookingId, patientName, doctorName, appointmentDate }) {
  if (!to) {
    throw new Error('Patient email address is missing');
  }

  const formattedDate = new Date(appointmentDate).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });

  const transporter = createTransporter();

  return transporter.sendMail({
    from: `"CareNest" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Appointment Confirmation - ${bookingId}`,
    text: [
      'Your CareNest appointment is confirmed.',
      '',
      `Booking ID: ${bookingId}`,
      `Patient: ${patientName}`,
      `Doctor: ${doctorName}`,
      `Date & Time: ${formattedDate}`,
      '',
      'Please keep your Booking ID for reference.'
    ].join('\n')
  });
}

module.exports = { sendAppointmentEmail };
