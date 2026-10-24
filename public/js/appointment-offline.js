(() => {
  const DATABASE_NAME = 'carenest-offline-booking';
  const DATABASE_VERSION = 1;
  const QUEUE_STORE = 'requests';
  const DOCTOR_STORE = 'doctors';
  const AVAILABILITY_STORE = 'availability';
  const META_STORE = 'metadata';
  const offlineMessage = 'Your request is saved and will be submitted when you’re back online. It is not confirmed yet.';
  let databasePromise;
  let syncInProgress = false;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: 'requestId' });
        }
        if (!db.objectStoreNames.contains(DOCTOR_STORE)) {
          db.createObjectStore(DOCTOR_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(AVAILABILITY_STORE)) {
          db.createObjectStore(AVAILABILITY_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local booking storage.'));
    });
    return databasePromise;
  }

  async function storeRecord(storeName, record) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save local booking data.'));
      transaction.onabort = () => reject(transaction.error || new Error('Local booking storage was interrupted.'));
    });
  }

  async function getRecord(storeName, key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not read local booking data.'));
    });
  }

  async function getAllRecords(storeName) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName).objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not read local booking data.'));
    });
  }

  async function deleteRecord(storeName, key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not update local booking data.'));
    });
  }

  async function storeDoctors(doctors) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCTOR_STORE, 'readwrite');
      const store = transaction.objectStore(DOCTOR_STORE);
      store.clear();
      doctors.forEach(doctor => store.put(doctor));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save the doctor list.'));
    });
  }

  async function storeAvailability(doctorId, date, slots) {
    return storeRecord(AVAILABILITY_STORE, {
      key: `${doctorId}:${date}`,
      doctorId,
      date,
      slots,
      updatedAt: Date.now()
    });
  }

  async function getAvailability(doctorId, date) {
    if (!doctorId || !date) return null;
    const saved = await getRecord(AVAILABILITY_STORE, `${doctorId}:${date}`);
    return saved ? saved.slots : null;
  }

  async function saveRequest(payload, existingRequestId) {
    const request = {
      requestId: existingRequestId || crypto.randomUUID(),
      patientId: payload.offlinePatientId,
      payload,
      status: 'pending',
      createdAt: Date.now()
    };
    await storeRecord(QUEUE_STORE, request);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(registration => {
          if (registration.sync) {
            return registration.sync.register('sync-offline-appointments');
          }
          return undefined;
        })
        .catch(error => console.warn('Background appointment sync is unavailable:', error));
    }
    return request;
  }

  async function syncRequest(request) {
    let response;
    try {
      response = await fetch('/appointments', {
        method: 'POST',
        credentials: 'same-origin',
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
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) {
        return { pending: true, message: offlineMessage };
      }
      throw error;
    }

    if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
      return { pending: true, message: 'Sign in to the same patient account while online to submit this saved request.' };
    }

    const result = await response.json();
    if (response.ok && result.success) {
      await deleteRecord(QUEUE_STORE, request.requestId);
      return {
        submitted: true,
        message: `${result.message}${result.bookingId ? ` Booking ID: ${result.bookingId}.` : ''}`
      };
    }

    if (response.status === 400 || response.status === 409 || response.status === 403) {
      request.status = 'needs-attention';
      request.message = result.message || 'This request needs attention before it can be submitted.';
      await storeRecord(QUEUE_STORE, request);
      return { attention: true, message: request.message };
    }

    return { pending: true, message: offlineMessage };
  }

  async function syncPending(patientId) {
    if (!patientId || syncInProgress || !navigator.onLine) return;
    syncInProgress = true;
    try {
      const requests = await getAllRecords(QUEUE_STORE);
      for (const request of requests) {
        if (request.patientId !== patientId || request.status !== 'pending') continue;
        const result = await syncRequest(request);
        if (result.submitted || result.attention) {
          showStatus(result.message, result.submitted);
          if (result.submitted) {
            const form = document.querySelector('[data-offline-booking-form]');
            const submit = form?.querySelector('[type="submit"]');
            if (submit) submit.disabled = true;
          }
        } else if (result.pending) {
          showStatus(result.message, false);
          break;
        }
      }
    } catch (error) {
      console.error('Saved appointment sync failed:', error);
      showStatus(offlineMessage, false);
    } finally {
      syncInProgress = false;
    }
  }

  function showStatus(message, success) {
    const status = document.getElementById('offlineBookingStatus');
    if (!status) return;
    status.textContent = message;
    status.setAttribute('aria-live', 'polite');
    status.style.color = success ? '#065f46' : '#92400e';
  }

  async function initializeForm(form) {
    const patientId = form.dataset.patientId || '';
    const doctorSelect = form.querySelector('[name="doctorId"]');
    const nameInput = form.querySelector('[name="patientName"]');
    const submit = form.querySelector('[type="submit"]');

    if (patientId) {
      await storeRecord(META_STORE, {
        key: 'patient',
        id: patientId,
        fullName: nameInput?.value || ''
      });
    }

    if (doctorSelect && form.id === 'offlineAppointmentForm') {
      const doctors = await getAllRecords(DOCTOR_STORE);
      doctorSelect.replaceChildren(new Option(
        doctors.length ? 'Select a saved doctor' : 'No saved doctors available',
        ''
      ));
      doctors.forEach(doctor => {
        doctorSelect.add(new Option(`${doctor.name} — ${doctor.specialty}`, doctor.id));
      });
      const patient = await getRecord(META_STORE, 'patient');
      if (!patientId && patient) {
        form.dataset.patientId = patient.id;
        if (nameInput && !nameInput.value) nameInput.value = patient.fullName;
      }
      if (submit) submit.disabled = doctors.length === 0 || !form.dataset.patientId;
    } else if (doctorSelect) {
      const doctors = [...doctorSelect.options]
        .filter(option => option.value)
        .map(option => ({
          id: option.value,
          name: option.dataset.name || option.textContent.split(' — ')[0],
          specialty: option.dataset.specialty || ''
        }));
      await storeDoctors(doctors);
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const payload = {
        patientName: String(data.get('patientName') || '').trim(),
        relationship: String(data.get('relationship') || 'Self'),
        doctorId: String(data.get('doctorId') || ''),
        appointmentDay: String(data.get('appointmentDay') || ''),
        appointmentTime: String(data.get('appointmentTime') || ''),
        reason: String(data.get('reason') || ''),
        offlinePatientId: form.dataset.patientId || patientId
      };
      if (
        !payload.patientName ||
        !payload.doctorId ||
        !payload.appointmentDay ||
        !payload.appointmentTime
      ) {
        showStatus('Enter the patient name, doctor, requested date and requested time.', false);
        return;
      }

      if (!payload.offlinePatientId) {
        showStatus('Sign in while online before saving an offline appointment request.', false);
        return;
      }

      if (submit) submit.disabled = true;
      try {
        const request = await saveRequest(payload, form.dataset.offlineRequestId);
        form.dataset.offlineRequestId = request.requestId;
        showStatus(offlineMessage, false);
        if (navigator.onLine) {
          const result = await syncRequest(request);
          showStatus(result.message, Boolean(result.submitted));
          if (result.submitted) {
            delete form.dataset.offlineRequestId;
            if (submit) submit.disabled = true;
          } else if (submit) {
            submit.disabled = false;
          }
        }
      } catch (error) {
        console.error('Could not save appointment request on this device:', error);
        showStatus('This device could not save your request. Please keep this page open and try again.', false);
        if (submit) submit.disabled = false;
      }
    });

    if (patientId) syncPending(patientId);
  }

  window.CareNestOffline = {
    getAvailability,
    storeAvailability,
    syncPending
  };

  const signedInPatientId = document.body.dataset.patientId || '';
  if (signedInPatientId) syncPending(signedInPatientId);

  window.addEventListener('appointment-slots-loaded', event => {
    const { doctorId, date, slots } = event.detail || {};
    if (doctorId && date && Array.isArray(slots)) {
      storeAvailability(doctorId, date, slots).catch(error => {
        console.error('Could not cache appointment availability:', error);
      });
    }
  });

  document.querySelectorAll('[data-offline-booking-form]').forEach(form => {
    initializeForm(form).catch(error => {
      console.error('Offline appointment form could not be initialized:', error);
      showStatus('Offline booking storage is unavailable in this browser.', false);
    });
  });

  window.addEventListener('online', async () => {
    const patient = await getRecord(META_STORE, 'patient').catch(error => {
      console.error('Could not load saved patient account information:', error);
      return null;
    });
    const patientId = signedInPatientId || patient?.id;
    if (patientId) syncPending(patientId);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'offline-booking-synced') {
        showStatus(event.data.message, Boolean(event.data.success));
      }
    });
  }
})();
