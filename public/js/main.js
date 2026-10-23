
document.addEventListener('DOMContentLoaded', () => {
  const scenarioForms = [...document.querySelectorAll('.scenario-run-form')];

  if (scenarioForms.length) {
    const panel = document.getElementById('healingRunPanel');
    const runTitle = document.getElementById('healingRunTitle');
    const timer = document.getElementById('healingTimer');
    const progressBar = document.getElementById('healingProgressBar');
    const liveLog = document.getElementById('healingLiveLog');
    const seenLogs = new Set();
    const labels = {
      'database-reconnect': 'Database reconnect',
      'doctor-api': 'Doctor directory API',
      'network-connectivity': 'Network connectivity',
      'booking-idempotency': 'Duplicate booking protection',
      'notification-adapter': 'Notification adapter',
      'appointment-reconciliation': 'Data reconciliation'
    };
    let polling = false;

    const setScenarioStatus = (scenario, state, text) => {
      const badge = document.querySelector(`[data-scenario-badge="${scenario}"]`);
      if (badge) {
        badge.textContent = text;
        badge.className = `scenario-live-status is-${state}`;
      }

      const status = document.querySelector(`[data-service-status="${scenario}"]`);
      if (status) {
        status.textContent = text;
        status.className = `block ${state === 'green' ? 'text-emerald-700' : state === 'red' ? 'text-red-700' : state === 'yellow' ? 'text-amber-700' : 'text-slate-500'}`;
      }

      const light = document.querySelector(`[data-service-light="${scenario}"]`);
      if (light) {
        light.className = `h-3 w-3 shrink-0 rounded-full ${state === 'green' ? 'bg-emerald-500' : state === 'red' ? 'bg-red-500' : state === 'yellow' ? 'bg-amber-400 animate-pulse' : 'bg-slate-300'}`;
      }
    };

    const appendProgressLog = entry => {
      const key = `${entry.timestamp}:${entry.scenario}:${entry.phase}:${entry.status}`;
      if (seenLogs.has(key)) return;
      seenLogs.add(key);

      const line = document.createElement('p');
      line.className = 'm-0';
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const phase = {
        detect: 'DETECT',
        diagnose: 'DIAGNOSE',
        heal: 'RECOVER',
        verify: 'VERIFY',
        complete: 'RESULT'
      }[entry.phase] || entry.status.toUpperCase();
      line.textContent = `[${time}] [${phase}] ${entry.message}`;
      if (entry.status === 'failed') line.classList.add('text-red-300');
      if (entry.phase === 'heal') line.classList.add('text-amber-300');
      liveLog.append(line);
      liveLog.scrollTop = liveLog.scrollHeight;
    };

    const pollRun = async () => {
      if (polling) return;
      polling = true;
      panel.classList.remove('hidden');

      try {
        let running = true;
        while (running) {
          const response = await fetch('/self-healing/run-status', {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Could not read scenario progress.');

          result.logs.slice().reverse().forEach(appendProgressLog);
          running = result.running;

          if (running && result.currentScenario) {
            const elapsed = Math.min(10, Math.floor(
              (Date.now() - new Date(result.currentStartedAt).getTime()) / 1000
            ));
            runTitle.textContent = `Recovering: ${labels[result.currentScenario] || result.currentScenario}`;
            timer.textContent = `${elapsed} / 10 seconds`;
            progressBar.style.width = `${elapsed * 10}%`;
            setScenarioStatus(result.currentScenario, 'yellow', 'Recovering');
          }

          for (const entry of result.logs.slice().reverse()) {
            if (entry.phase === 'detect') {
              setScenarioStatus(entry.scenario, 'red', 'Detecting');
            } else if (entry.phase === 'diagnose') {
              setScenarioStatus(entry.scenario, 'yellow', 'Diagnosing');
            } else if (entry.phase === 'heal') {
              setScenarioStatus(entry.scenario, 'yellow', 'Recovering');
            } else if (entry.phase === 'verify') {
              setScenarioStatus(entry.scenario, 'yellow', 'Verifying');
            } else if (entry.phase === 'complete') {
              setScenarioStatus(
                entry.scenario,
                entry.status === 'passed' ? 'green' : 'red',
                entry.status === 'passed' ? 'Healthy' : 'Failed'
              );
            }
          }

          if (running) await new Promise(resolve => setTimeout(resolve, 500));
        }

        runTitle.textContent = result.error || 'Scenario run complete';
        timer.textContent = 'Complete';
        progressBar.style.width = '100%';
        scenarioForms.forEach(form => {
          const button = form.querySelector('button[type="submit"]');
          if (button) button.disabled = false;
        });
        window.setTimeout(() => window.location.reload(), 900);
      } catch (error) {
        runTitle.textContent = error.message;
        timer.textContent = 'Unable to read progress';
        progressBar.classList.add('bg-red-600');
        scenarioForms.forEach(form => {
          const button = form.querySelector('button[type="submit"]');
          if (button) button.disabled = false;
        });
        polling = false;
      }
    };

    scenarioForms.forEach(form => {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (polling) return;

        const onlineField = form.querySelector('[name="browserOnline"]');
        if (onlineField) onlineField.value = String(navigator.onLine);

        const button = form.querySelector('button[type="submit"]');
        scenarioForms.forEach(item => {
          const itemButton = item.querySelector('button[type="submit"]');
          if (itemButton) itemButton.disabled = true;
        });
        button.textContent = 'Starting…';
        liveLog.replaceChildren();
        seenLogs.clear();
        runTitle.textContent = 'Starting scenario…';
        timer.textContent = '0 / 10 seconds';
        progressBar.style.width = '0%';
        progressBar.classList.remove('bg-red-600');

        try {
          const body = new URLSearchParams(new FormData(form));
          const response = await fetch(form.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Could not start scenario.');
          runTitle.textContent = form.dataset.scenario === 'all'
            ? 'Running all six scenarios…'
            : `Recovering: ${labels[form.dataset.scenario]}`;
          polling = false;
          pollRun();
        } catch (error) {
          runTitle.textContent = error.message;
          timer.textContent = 'Not started';
          scenarioForms.forEach(item => {
            const itemButton = item.querySelector('button[type="submit"]');
            if (itemButton) itemButton.disabled = false;
          });
          button.focus();
        }
      });
    });

    fetch('/self-healing/run-status', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(response => response.json())
      .then(result => {
        if (result.running) pollRun();
      })
      .catch(error => {
        panel.classList.remove('hidden');
        runTitle.textContent = `Could not restore scenario progress: ${error.message}`;
        timer.textContent = 'Progress unavailable';
      });
  }

  // Mobile navigation
  const toggle = document.getElementById('mobileMenuButton');
  const menu = document.getElementById('mobileMenu');

  if (toggle && menu) {
    const menuIcon = toggle.querySelector('i');

    const setMenuOpen = isOpen => {
      menu.classList.toggle('hidden', !isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');

      if (menuIcon) {
        menuIcon.classList.toggle('fa-bars', !isOpen);
        menuIcon.classList.toggle('fa-xmark', isOpen);
      }
    };

    toggle.addEventListener('click', () => {
      setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    menu.addEventListener('click', event => {
      if (event.target.closest('a')) setMenuOpen(false);
    });

    document.addEventListener('click', event => {
      if (!menu.classList.contains('hidden') &&
          !menu.contains(event.target) &&
          !toggle.contains(event.target)) {
        setMenuOpen(false);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.classList.contains('hidden')) {
        setMenuOpen(false);
        toggle.focus();
      }
    });
  }

  // Login and registration
  const form = document.getElementById('authForm');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const mode = form.dataset.mode;
      const msg = document.getElementById('authMessage');
      const btn = document.getElementById('authSubmit');
      const data = Object.fromEntries(new FormData(form).entries());

      if (mode === 'register' && data.password !== data.confirmPassword) {
        msg.textContent = 'Passwords do not match.';
        msg.className = 'inline-message error';
        return;
      }

      delete data.confirmPassword;
      btn.disabled = true;
      btn.textContent = mode === 'register'
        ? 'Creating account...'
        : 'Signing in securely...';
      msg.textContent = '';

      try {
        const response = await fetch(`/api/auth/${mode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Something went wrong.');
        }

        msg.textContent = result.message;
        msg.className = 'inline-message success';
        window.location.href = result.redirect || '/dashboard';
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'inline-message error';
      } finally {
        btn.disabled = false;
        btn.textContent = mode === 'register'
          ? 'Create my account'
          : 'Sign in securely';
      }
    });
  }

  // Appointment date minimum
  const dateInput = document.getElementById('appointmentDate');

  function setMinimumDate() {
    if (!dateInput) return;

    const minDate = new Date(Date.now() + 60 * 60 * 1000);
    minDate.setMinutes(minDate.getMinutes() - minDate.getTimezoneOffset());
    dateInput.min = minDate.toISOString().slice(0, 16);
  }

  setMinimumDate();

  // Voice appointment form
  const voiceBtn = document.getElementById('voiceReason');
  if (!voiceBtn) return;

  const status = document.getElementById('voiceStatus');
  const patientName = document.getElementById('patientName');
  const relationship = document.getElementById('relationship');
  const doctorSelect = document.getElementById('doctorId');
  const appointmentDate = document.getElementById('appointmentDate');
  const reason = document.getElementById('reason');

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  let step = 0;
  let active = false;
  let recognition = null;
  let resultHandled = false;

  const normalise = value => value.toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function selectRelationship(text) {
    const spoken = normalise(text);
    let target = '';

    // Check longer / specific phrases first
    if (/other family|relative|rishtedar|रिश्तेदार/.test(spoken)) {
      target = 'other family member';
    } else if (
      /spouse|husband|wife|pati|patni|पति|पत्नी/.test(spoken)
    ) {
      target = 'spouse';
    } else if (
      /child|son|daughter|beta|beti|बेटा|बेटी|बच्चा/.test(spoken)
    ) {
      target = 'child';
    } else if (
      /parent|parents|mother|father|mom|dad|mummy|papa|maa|pita|पैरेंट|पेरेंट|मम्मी|पापा|माता|पिता/.test(spoken)
    ) {
      target = 'parent';
    } else if (
      /self|myself|khud|apne|mere liye|सेल्फ|खुद/.test(spoken)
    ) {
      target = 'self';
    }

    if (!target) return false;

    const match = [...relationship.options].find(option =>
      normalise(option.textContent) === target
    );

    if (!match) {
      status.textContent =
        'Relationship option list mein nahi mila. Dropdown manually check karein.';
      return false;
    }

    relationship.value = match.value;
    relationship.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function selectDoctor(text) {
    const spoken = normalise(text);
    if (!spoken) return false;

    const options = [...doctorSelect.options].filter(option => option.value);
    const spokenWords = spoken.split(' ').filter(word => word.length > 1);

    const scored = options.map(option => {
      const label = normalise(option.textContent);
      const score = spokenWords.reduce(
        (sum, word) => sum + (label.includes(word) ? 1 : 0), 0
      );
      return { option, score };
    }).sort((a, b) => b.score - a.score);

    if (
      !scored.length ||
      scored[0].score === 0 ||
      (scored[1] && scored[1].score === scored[0].score)
    ) {
      return false;
    }

    doctorSelect.value = scored[0].option.value;
    doctorSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function parseSpokenDate(text) {
    const value = text.toLowerCase()
      .replace(/(\d+)(st|nd|rd|th)/g, '$1')
      .replace(/\bat\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const months = {
      jan: 0, january: 0, feb: 1, february: 1,
      mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6,
      aug: 7, august: 7, sep: 8, sept: 8, september: 8,
      oct: 9, october: 9, nov: 10, november: 10,
      dec: 11, december: 11
    };

    const monthPattern =
      'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|' +
      'jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|' +
      'oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

    let match = value.match(
      new RegExp(
        '(\\d{1,2})\\s+(' + monthPattern + ')\\s+(\\d{4}).*?(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)'
      )
    );

    let day, month, year, hour, minute, meridiem;

    if (match) {
      day = Number(match[1]);
      month = months[match[2]];
      year = Number(match[3]);
      hour = Number(match[4]);
      minute = Number(match[5] || 0);
      meridiem = match[6].replace(/\./g, '');
    } else {
      match = value.match(
        /(\d{1,2})[/-](\d{1,2})[/-](\d{4}).*?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/
      );

      if (!match) return null;

      day = Number(match[1]);
      month = Number(match[2]) - 1;
      year = Number(match[3]);
      hour = Number(match[4]);
      minute = Number(match[5] || 0);
      meridiem = match[6].replace(/\./g, '');
    }

    if (
      day < 1 || day > 31 || month < 0 || month > 11 ||
      hour < 1 || hour > 12 || minute < 0 || minute > 59
    ) return null;

    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;

    const date = new Date(year, month, day, hour, minute);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month ||
      date.getDate() !== day ||
      date < new Date(Date.now() + 60 * 60 * 1000)
    ) return null;

    return [
      year,
      String(month + 1).padStart(2, '0'),
      String(day).padStart(2, '0')
    ].join('-') + 'T' +
      String(hour).padStart(2, '0') + ':' +
      String(minute).padStart(2, '0');
  }

  const steps = [
    {
      prompt: 'Step 1/5: Patient ka poora naam boliye.',
      parse: text => {
        patientName.value = text.trim();
        patientName.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    },
    {
      prompt: 'Step 2/5: Sirf Self ya Parent boliye.',
      parse: selectRelationship
    },
    {
      prompt: 'Step 3/5: Dropdown mein doctor ka naam boliye.',
      parse: selectDoctor
    },
    {
      prompt: 'Step 4/5: English mein date aur time boliye, jaise 25 October 2026 at 10 AM.',
      parse: text => {
        const parsed = parseSpokenDate(text);
        if (!parsed) return false;

        appointmentDate.value = parsed;
        appointmentDate.dispatchEvent(new Event('input', { bubbles: true }));
        appointmentDate.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    },
    {
      prompt: 'Step 5/5: Appointment ka reason boliye.',
      parse: text => {
        reason.value = text.trim();
        reason.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    }
  ];

  function stopVoice(message) {
    active = false;
    voiceBtn.disabled = false;
    voiceBtn.textContent = 'Try voice again';
    status.textContent = message;
  }

  function listenForStep() {
    if (!active) return;

    if (step >= steps.length) {
      active = false;
      voiceBtn.disabled = false;
      voiceBtn.textContent = 'Use voice to fill details';
      status.textContent =
        'Voice entry complete. Please verify all fields before submitting.';
      return;
    }

    resultHandled = false;
    status.textContent = steps[step].prompt;

    recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = event => {
      const spoken = event.results[0][0].transcript.trim();

      if (!spoken) {
        stopVoice('Speech nahi samajh aayi. Dobara try karein.');
        return;
      }

      const currentStep = step;
      const success = steps[currentStep].parse(spoken);

      if (success) {
        step = currentStep + 1;
        resultHandled = true;
        status.textContent = 'Samajh gaya: ' + spoken;
      } else {
        stopVoice(
          currentStep === 1
            ? 'Relationship samajh nahi aaya. Self ya Parent clearly bolkar dobara try karein.'
            : currentStep === 2
              ? 'Doctor match nahi hua. Doctor ka naam dropdown se manually choose kar sakte hain.'
              : 'Date/time samajh nahi aaya. Example format mein dobara try karein.'
        );
      }
    };

    recognition.onerror = event => {
      stopVoice(event.error === 'not-allowed'
        ? 'Microphone permission allow karein, phir try karein.'
        : 'Voice recognition mein problem hui. Button dobara dabayein.');
    };

    recognition.onend = () => {
      if (active && resultHandled) {
        window.setTimeout(listenForStep, 400);
      }
    };

    try {
      recognition.start();
    } catch (error) {
      stopVoice('Voice start nahi hui. Button dobara dabayein.');
    }
  }

  voiceBtn.addEventListener('click', () => {
    if (!SpeechRecognition) {
      status.textContent = 'Voice recognition supported nahi hai. Chrome mein try karein.';
      return;
    }

    if (active) return;

    // Resume from the failed step; restart after a completed session.
    if (step >= steps.length) step = 0;

    active = true;
    voiceBtn.disabled = true;
    voiceBtn.textContent = 'Listening...';
    listenForStep();
  });
});
