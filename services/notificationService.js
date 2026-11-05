const Notification = require('../models/Notification');

let simulatedFailureActive = false;
let recoveryTimer = null;
let queuedNotifications = [];

async function createNotification(notification) {
  if (simulatedFailureActive) {
    queuedNotifications.push(notification);
    return { queued: true };
  }

  return Notification.create(notification);
}

async function recoverNotificationDelivery() {
  if (recoveryTimer) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  while (queuedNotifications.length) {
    const batch = queuedNotifications.slice();
    await Notification.insertMany(batch);
    queuedNotifications.splice(0, batch.length);
  }

  simulatedFailureActive = false;
  return true;
}

function simulateNotificationFailure(durationMs) {
  if (!Number.isInteger(durationMs) || durationMs < 1) {
    throw new Error('Notification failure duration must be a positive integer.');
  }

  if (simulatedFailureActive) {
    throw new Error('A notification failure simulation is already active.');
  }

  simulatedFailureActive = true;

  return new Promise((resolve, reject) => {
    recoveryTimer = setTimeout(() => {
      recoverNotificationDelivery().then(resolve, reject);
    }, durationMs);
  });
}

function getNotificationDeliveryState() {
  return {
    simulatedFailureActive,
    queuedCount: queuedNotifications.length
  };
}

module.exports = {
  createNotification,
  getNotificationDeliveryState,
  recoverNotificationDelivery,
  simulateNotificationFailure
};
