const CACHE_NAME = 'carenest-offline-v2';
const OFFLINE_BOOKING_PAGE = '/offline-booking.html';
const OFFLINE_ASSETS = [
  OFFLINE_BOOKING_PAGE,
  '/js/appointment-offline.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(OFFLINE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('carenest-offline-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  if (
    event.request.method === 'GET' &&
    event.request.mode === 'navigate' &&
    requestUrl.origin === self.location.origin
  ) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cachedPage = await caches.match(OFFLINE_BOOKING_PAGE);
        if (!cachedPage) {
          return new Response('Offline booking is not available yet. Reopen this page while online first.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        return cachedPage;
      })
    );
    return;
  }

  if (
    event.request.method === 'GET' &&
    requestUrl.origin === self.location.origin &&
    OFFLINE_ASSETS.includes(requestUrl.pathname)
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});

self.addEventListener('sync', event => {
  if (event.tag === 'sync-offline-appointments') {
    event.waitUntil(syncSavedAppointments());
  }
});

async function syncSavedAppointments() {
  const database = await openBookingDatabase();
  const requests = await readPendingRequests(database);

  for (const request of requests) {
    if (request.status !== 'pending') continue;

    const response = await fetch('/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Offline-Booking': 'true'
      },
      body: JSON.stringify({
        ...request.payload,
        requestId: request.requestId,
        offlinePatientId: request.patientId
      })
    });

    if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
      return;
    }

    const result = await response.json();
    if (response.ok && result.success) {
      await deletePendingRequest(database, request.requestId);
      await notifyBookingClients(result.message, true);
      continue;
    }

    if ([400, 403, 409].includes(response.status)) {
      request.status = 'needs-attention';
      request.message = result.message || 'This request needs attention before it can be submitted.';
      await savePendingRequest(database, request);
      await notifyBookingClients(request.message, false);
      continue;
    }

    throw new Error(result.message || 'Offline appointment sync failed.');
  }
}

function openBookingDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('carenest-offline-booking', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open saved appointment requests.'));
  });
}

function readPendingRequests(database) {
  return new Promise((resolve, reject) => {
    const request = database.transaction('requests').objectStore('requests').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not read saved appointment requests.'));
  });
}

function deletePendingRequest(database, requestId) {
  return updatePendingRequest(database, store => store.delete(requestId));
}

function savePendingRequest(database, request) {
  return updatePendingRequest(database, store => store.put(request));
}

function updatePendingRequest(database, update) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('requests', 'readwrite');
    update(transaction.objectStore('requests'));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not update saved appointment request.'));
  });
}

async function notifyBookingClients(message, success) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage({
    type: 'offline-booking-synced',
    message,
    success
  }));
}
