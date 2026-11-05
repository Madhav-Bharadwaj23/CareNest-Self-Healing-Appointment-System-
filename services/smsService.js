function buildAppointmentSms({ bookingId, patientName, doctorName, appointmentDate }) {
  const formattedDate = new Date(appointmentDate).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });

  return `CareNest: Appointment confirmed. Booking ID: ${bookingId}. Patient: ${patientName}. Doctor: ${doctorName}. Date & Time: ${formattedDate}. Please keep your Booking ID for reference.`;
}

async function sendAppointmentSms(details) {
  const message = buildAppointmentSms(details);

  // Dry-run mode: no SMS is sent to any real mobile number.
  console.log('\n========== CARENEST SMS DRY RUN ==========');
  console.log(message);
  console.log('========== SMS NOT SENT (TEST MODE) ======\n');

  return { success: true, mode: 'dry-run', message };
}

module.exports = { buildAppointmentSms, sendAppointmentSms };
