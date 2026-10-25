function formatDoctorAvailability(doctor) {
  const validTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const workingDays = Array.isArray(doctor.workingDays)
    ? doctor.workingDays.filter(day => typeof day === 'string')
    : [];

  if (
    workingDays.length &&
    validTimePattern.test(doctor.startTime || '') &&
    validTimePattern.test(doctor.endTime || '')
  ) {
    const formatTime = time => {
      const [hour, minute] = time.split(':').map(Number);
      return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
    };

    return `${workingDays.join(', ')}, ${formatTime(doctor.startTime)} to ${formatTime(doctor.endTime)}`;
  }

  return String(doctor.availability || 'Please contact reception')
    .replace(/â€“|â€”/g, ' to ');
}

module.exports = { formatDoctorAvailability };
