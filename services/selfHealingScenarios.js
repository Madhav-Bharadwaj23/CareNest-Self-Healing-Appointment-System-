const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { sendAppointmentSms } = require('./smsService');
const Notification = require('../models/Notification');
const {
  createNotification,
  getNotificationDeliveryState,
  recoverNotificationDelivery,
  simulateNotificationFailure
} = require('./notificationService');

const logPath = path.join(__dirname, '..', 'data', 'self-healing-runs.jsonl');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const scenarioNarratives = {
  'database-reconnect': {
    detected: 'Starting an isolated MongoDB connection recovery test; live app connection remains untouched.',
    diagnosis: 'Checking whether a separate test connection can ping MongoDB, close cleanly, and reconnect.',
    recovery: 'Closing only the isolated test connection, then opening a fresh connection.',
    verify: 'Pinging MongoDB again through the newly opened test connection.'
  },
  'doctor-api': {
    detected: 'Checking the real doctor directory endpoint.',
    diagnosis: 'Validating the HTTP response and expected directory content.',
    recovery: 'Retrying the read-only directory check once if the first request fails.',
    verify: 'Confirming the endpoint returned a valid doctor directory.'
  },
  'network-connectivity': {
    detected: 'Checking browser connectivity and the live health endpoint.',
    diagnosis: 'Comparing navigator online state with a real request to the app.',
    recovery: 'Retrying the health endpoint once if the first request fails; no network is disabled.',
    verify: 'Confirming the app health endpoint is reachable.'
  },
  'booking-idempotency': {
    detected: 'Creating a unique probe request in the isolated test database.',
    diagnosis: 'Checking whether MongoDB has a unique request ID constraint for the probe.',
    recovery: 'Submitting a duplicate probe request and confirming MongoDB rejects it.',
    verify: 'Removing the temporary probe and confirming duplicate prevention worked.'
  },
  'notification-adapter': {
    detected: 'Checking the existing notification adapter in dry-run mode.',
    diagnosis: 'Verifying the adapter response without using a real phone number.',
    recovery: 'Executing the adapter test; no external SMS is sent.',
    verify: 'Confirming the adapter reports dry-run mode.'
  },
  'notification-delivery': {
    detected: 'Starting a controlled in-app notification delivery failure test.',
    diagnosis: 'Confirming the notification service is available before the simulation.',
    recovery: 'Simulating a short notification outage; new notices are buffered for automatic recovery.',
    verify: 'Confirming the service recovered and the buffered test notice was delivered.'
  },
  'appointment-reconciliation': {
    detected: 'Creating temporary appointment and slot-lock records in the isolated test database.',
    diagnosis: 'Finding a stale lock tied to a cancelled probe appointment.',
    recovery: 'Removing only the confirmed stale probe lock; preserving booked and unknown locks.',
    verify: 'Checking repaired probe data, then deleting all temporary records.'
  }
};

function isolatedMongoDatabaseName() {
  const databaseName = mongoose.connection.name;

  if (!databaseName) {
    throw new Error('MongoDB must be connected before isolated self-healing checks can run.');
  }

  if (databaseName.endsWith('_self_heal_test')) {
    throw new Error('MONGODB_URI must point to the app database, not the test database.');
  }

  return `${databaseName}_self_heal_test`;
}

async function appendLog(entry) {
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry
  })}\n`, 'utf8');
}

async function readRecentLogs() {
  try {
    const content = await fs.readFile(logPath, 'utf8');
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .reverse()
      .map(line => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function runLoggedScenario(name, action, options) {
  const startedAt = Date.now();
  const duration = 10000;
  const narrative = scenarioNarratives[name];
  let outcome = 'passed';
  let resultMessage = 'Scenario completed and verified.';

  const publish = async (phase, message) => {
    const entry = {
      timestamp: new Date().toISOString(),
      scenario: name,
      status: 'step',
      phase,
      message
    };
    await appendLog(entry);
    if (options.onProgress) options.onProgress(entry);
  };

  try {
    await publish('detect', narrative.detected);
    await sleep(Math.max(0, startedAt + 2500 - Date.now()));
    await publish('diagnose', narrative.diagnosis);
    await sleep(Math.max(0, startedAt + 5000 - Date.now()));
    if (
      options.selfHealingEnabled === false ||
      (options.isSelfHealingEnabled && !options.isSelfHealingEnabled())
    ) {
      outcome = 'failed';
      resultMessage = 'Recovery failed: self-healing is turned off. The issue was detected but no recovery action was attempted.';
      await sleep(Math.max(0, startedAt + duration - Date.now()));
      await appendLog({
        timestamp: new Date().toISOString(),
        scenario: name,
        status: outcome,
        phase: 'complete',
        message: resultMessage
      });
      return;
    }
    await publish('heal', narrative.recovery);
    const message = await action(publish);
    await sleep(Math.max(0, startedAt + duration - 2500 - Date.now()));
    await publish('verify', narrative.verify);
    await sleep(Math.max(0, startedAt + duration - Date.now()));
    await appendLog({
      timestamp: new Date().toISOString(),
      scenario: name,
      status: 'passed',
      phase: 'complete',
      message
    });
  } catch (error) {
    outcome = 'failed';
    resultMessage = String(error.message)
      .replace(/(mongodb(?:\+srv)?:\/\/)[^@\s]+@/gi, '$1[redacted]@')
      .slice(0, 500);
    await sleep(Math.max(0, startedAt + duration - Date.now()));
    await appendLog({
      timestamp: new Date().toISOString(),
      scenario: name,
      status: outcome,
      phase: 'complete',
      message: resultMessage
    });
  } finally {
    if (options.onProgress) {
      options.onProgress({
        timestamp: new Date().toISOString(),
        scenario: name,
        status: outcome,
        phase: 'complete',
        message: resultMessage
      });
    }
  }
}

async function connectToIsolatedDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured.');
  }

  const connection = mongoose.createConnection(process.env.MONGODB_URI, {
    dbName: isolatedMongoDatabaseName(),
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });

  try {
    await connection.asPromise();
    return connection;
  } catch (error) {
    if (connection.readyState !== 0) {
      await connection.close();
    }

    throw error;
  }
}

async function testDatabaseReconnect() {
  const connection = await connectToIsolatedDatabase();

  try {
    await connection.db.admin().command({ ping: 1 });
    await connection.close();
  } finally {
    if (connection.readyState !== 0) {
      await connection.close();
    }
  }

  const recoveredConnection = await connectToIsolatedDatabase();

  try {
    await recoveredConnection.db.admin().command({ ping: 1 });
  } finally {
    await recoveredConnection.close();
  }
}

async function testBookingIdempotencyIndex() {
  const connection = await connectToIsolatedDatabase();
  const collection = connection.collection('self_heal_booking_probes');
  const requestId = `probe-${new mongoose.Types.ObjectId()}`;

  try {
    await collection.createIndex({ requestId: 1 }, { unique: true });
    await collection.insertOne({ requestId, createdAt: new Date() });

    let duplicateRejected = false;

    try {
      await collection.insertOne({ requestId, createdAt: new Date() });
    } catch (error) {
      if (error.code !== 11000) throw error;
      duplicateRejected = true;
    }

    if (!duplicateRejected) {
      throw new Error('The isolated database accepted a duplicate booking request ID.');
    }

    return 'MongoDB unique index rejected a duplicate request ID in the isolated test database.';
  } finally {
    try {
      await collection.deleteMany({ requestId });
    } finally {
      await connection.close();
    }
  }
}

async function testHealthEndpoint(baseUrl) {
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
    response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok || response.status < 500 || attempt === 1) break;
    } catch (error) {
    if (attempt === 1) throw new Error(`Health endpoint failed after retry: ${error.message}`);
    }
  }

  if (!response?.ok) {
    if (response) {
    throw new Error(`Health endpoint returned HTTP ${response.status} after retry.`);
    }
  }

  const health = await response.json();

  if (health.status !== 'healthy') {
    throw new Error(`Health endpoint reports ${health.status}.`);
  }

  return 'Live app health endpoint returned healthy.';
}

async function testDoctorApi(baseUrl) {
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
    response = await fetch(`${baseUrl}/doctors`, {
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok || response.status < 500 || attempt === 1) break;
    } catch (error) {
    if (attempt === 1) throw new Error(`Doctor directory request failed after retry: ${error.message}`);
    }
  }

  if (!response?.ok) {
    throw new Error(`Doctor directory returned HTTP ${response?.status || 'no response'} after retry.`);
  }

  const html = await response.text();

  if (!html.includes('Our care team') && !html.includes('Meet your doctors')) {
    throw new Error('Doctor directory response did not contain the expected page.');
  }

  return `Live doctor directory returned HTTP ${response.status}.`;
}

async function testNetworkConnectivity(baseUrl, browserOnline) {
  if (browserOnline !== true) {
    throw new Error('The browser reports that it is offline.');
  }

  return testHealthEndpoint(baseUrl);
}

async function testNotificationAdapter() {
  const result = await sendAppointmentSms({
    bookingId: 'SELF-HEAL-TEST',
    patientName: 'Test Patient',
    doctorName: 'Test Doctor',
    appointmentDate: new Date()
  });

  if (result.mode !== 'dry-run') {
    throw new Error('Notification adapter is not in the expected non-delivery test mode.');
  }

  return 'Notification adapter executed in dry-run mode; no SMS was sent.';
}

async function testNotificationDelivery(publish) {
  const probeMessage = `Self-healing notification probe ${new mongoose.Types.ObjectId()}`;
  const recovery = simulateNotificationFailure(5000);
  let probeError = null;

  try {
    if (!getNotificationDeliveryState().simulatedFailureActive) {
      throw new Error('The simulated notification failure was not activated.');
    }

    await createNotification({
      userId: null,
      type: 'self-healing-probe',
      message: probeMessage
    });

    if (getNotificationDeliveryState().queuedCount !== 1) {
      throw new Error('The notification probe was not buffered during the simulated failure.');
    }
    await publish(
      'heal',
      'NOT DELIVERED (simulated failure): the test notification is queued until recovery.'
    );
  } catch (error) {
    probeError = error;
  }

  try {
    await recovery;
    const recoveredNotification = await Notification.findOne({
      type: 'self-healing-probe',
      message: probeMessage
    }).lean();

    if (!recoveredNotification) {
      throw new Error('The buffered notification was not delivered after recovery.');
    }

    if (probeError) throw probeError;

    await publish(
      'verify',
      'Notification delivery recovered: the queued test notification is now saved and delivered.'
    );
    return 'In-app notifications recovered and the buffered test notice was delivered within the 10-second scenario.';
  } finally {
    if (getNotificationDeliveryState().simulatedFailureActive) {
      await recoverNotificationDelivery();
    }
    await Notification.deleteOne({
      type: 'self-healing-probe',
      message: probeMessage
    });
  }
}

async function testAppointmentReconciliation() {
  const connection = await connectToIsolatedDatabase();
  const appointments = connection.collection('self_heal_reconciliation_appointments');
  const locks = connection.collection('self_heal_reconciliation_locks');
  const probeId = `probe-${new mongoose.Types.ObjectId()}`;

  try {
    await appointments.insertMany([
      { probeId, slot: 'cancelled-slot', status: 'cancelled' },
      { probeId, slot: 'booked-slot', status: 'booked' }
    ]);
    await locks.insertMany([
      { probeId, slot: 'cancelled-slot' },
      { probeId, slot: 'booked-slot' },
      { probeId, slot: 'unknown-slot' }
    ]);

    const cancelled = await appointments.find({
      probeId,
      status: 'cancelled'
    }).toArray();
    const staleSlots = cancelled.map(appointment => appointment.slot);
    const repair = await locks.deleteMany({
      probeId,
      slot: { $in: staleSlots }
    });
    const remainingLocks = await locks.find({ probeId }).toArray();

    if (
      repair.deletedCount !== 1 ||
      remainingLocks.length !== 2 ||
      remainingLocks.some(lock => lock.slot === 'cancelled-slot') ||
      !remainingLocks.some(lock => lock.slot === 'unknown-slot')
    ) {
      throw new Error('Isolated reconciliation did not remove only the confirmed stale lock.');
    }

    return 'Isolated reconciliation removed the cancelled booking lock and preserved booked/unknown locks for review.';
  } finally {
    try {
      await Promise.all([
        appointments.deleteMany({ probeId }),
        locks.deleteMany({ probeId })
      ]);
    } finally {
      await connection.close();
    }
  }
}

const scenarioActions = {
  'database-reconnect': async () => {
    await testDatabaseReconnect();
    return 'Isolated MongoDB connection closed and successfully reconnected.';
  },
  'doctor-api': async ({ baseUrl }) => testDoctorApi(baseUrl),
  'network-connectivity': async ({ baseUrl, browserOnline }) =>
    testNetworkConnectivity(baseUrl, browserOnline),
  'booking-idempotency': testBookingIdempotencyIndex,
  'notification-adapter': testNotificationAdapter,
  'notification-delivery': async (_options, publish) =>
    testNotificationDelivery(publish),
  'appointment-reconciliation': testAppointmentReconciliation
};

async function runSelfHealingScenario(name, options) {
  const action = scenarioActions[name];

  if (!action) {
    throw new Error('Unknown self-healing scenario.');
  }

  await runLoggedScenario(name, publish => action(options, publish), options);
  return readRecentLogs();
}

async function runSelfHealingScenarios(options) {
  await appendLog({
    scenario: 'scenario-suite',
    status: 'info',
    message: 'Starting all safe checks. Patient data will not be modified; the notification recovery test creates and removes a temporary probe notice.'
  });

  for (const name of Object.keys(scenarioActions)) {
    await runSelfHealingScenario(name, options);
  }

  return readRecentLogs();
}

module.exports = {
  readRecentLogs,
  runSelfHealingScenario,
  runSelfHealingScenarios
};
