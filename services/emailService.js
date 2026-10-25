const nodemailer = require('nodemailer');
const fs = require('fs/promises');
const path = require('path');
const { getHealth } = require('./selfHealing');

const pendingEmailsPath = path.join(__dirname, '..', 'data', 'pending-appointment-emails.json');
let queueOperation = Promise.resolve();

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

function withQueueLock(operation) {
  const currentOperation = queueOperation.then(operation, operation);
  queueOperation = currentOperation.catch(() => {});
  return currentOperation;
}

async function readPendingEmails() {
  try {
    const pendingEmails = JSON.parse(await fs.readFile(pendingEmailsPath, 'utf8'));
    if (!Array.isArray(pendingEmails)) {
      throw new Error('Pending appointment email queue must contain a JSON array.');
    }
    return pendingEmails;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writePendingEmails(pendingEmails) {
  const temporaryPath = `${pendingEmailsPath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(pendingEmailsPath), { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(pendingEmails, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, pendingEmailsPath);
}

async function deliverAppointmentEmail(email) {
  if (email.type === 'confirmation') {
    const {
      to,
      bookingId,
      patientName,
      doctorName,
      appointmentDate,
      tokenNumber
    } = email;
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
        ...(Number.isInteger(tokenNumber) ? [`Token Number: ${tokenNumber}`] : []),
        '',
        'Please keep your Booking ID for reference.'
      ].join('\n')
    });
  }

  if (email.type === 'update') {
    const {
      to,
      bookingId,
      patientName,
      doctorName,
      appointmentDate,
      tokenNumber,
      action
    } = email;
    const formattedDate = new Date(appointmentDate).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata'
    });
    const description = action === 'rescheduled'
      ? 'has been rescheduled'
      : 'has been cancelled';

    const transporter = createTransporter();
    return transporter.sendMail({
      from: `"CareNest" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Appointment ${action} - ${bookingId}`,
      text: [
        `Your CareNest appointment ${description} by your doctor.`,
        '',
        `Booking ID: ${bookingId}`,
        `Patient: ${patientName}`,
        `Doctor: ${doctorName}`,
        `Appointment date & time: ${formattedDate}`,
        ...(Number.isInteger(tokenNumber) ? [`Token Number: ${tokenNumber}`] : []),
        '',
        'Please contact the clinic if you have questions.'
      ].join('\n')
    });
  }

  throw new Error('Unsupported queued appointment email type.');
}

async function sendOrQueueAppointmentEmail(email) {
  if (!email.to) {
    throw new Error('Patient email address is missing');
  }

  return withQueueLock(async () => {
    if (!getHealth().enabled) {
      const pendingEmails = await readPendingEmails();
      pendingEmails.push({ ...email, queuedAt: new Date().toISOString() });
      await writePendingEmails(pendingEmails);
      return { queued: true };
    }

    const pendingEmails = await readPendingEmails();
    while (pendingEmails.length) {
      await deliverAppointmentEmail(pendingEmails[0]);
      pendingEmails.shift();
      await writePendingEmails(pendingEmails);
    }

    await deliverAppointmentEmail(email);
    return { queued: false };
  });
}

async function flushQueuedAppointmentEmails() {
  return withQueueLock(async () => {
    if (!getHealth().enabled) {
      throw new Error('Cannot send queued emails while self-healing is off.');
    }

    const pendingEmails = await readPendingEmails();
    let sentCount = 0;

    while (pendingEmails.length) {
      await deliverAppointmentEmail(pendingEmails[0]);
      pendingEmails.shift();
      await writePendingEmails(pendingEmails);
      sentCount += 1;
    }

    return sentCount;
  });
}

async function sendAppointmentEmail({
  to,
  bookingId,
  patientName,
  doctorName,
  appointmentDate,
  tokenNumber
}) {
  if (!to) {
    throw new Error('Patient email address is missing');
  }

  return sendOrQueueAppointmentEmail({
    type: 'confirmation',
    to,
    bookingId,
    patientName,
    doctorName,
    appointmentDate,
    tokenNumber
  });
}

async function sendAppointmentUpdateEmail({
  to,
  bookingId,
  patientName,
  doctorName,
  appointmentDate,
  tokenNumber,
  action
}) {
  if (!to) {
    throw new Error('Patient email address is missing');
  }

  if (!['rescheduled', 'cancelled'].includes(action)) {
    throw new Error('Unsupported appointment update action');
  }

  return sendOrQueueAppointmentEmail({
    type: 'update',
    to,
    bookingId,
    patientName,
    doctorName,
    appointmentDate,
    tokenNumber,
    action
  });
}

module.exports = {
  sendAppointmentEmail,
  sendAppointmentUpdateEmail,
  flushQueuedAppointmentEmails
};
