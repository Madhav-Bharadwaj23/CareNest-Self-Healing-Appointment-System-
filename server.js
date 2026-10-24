
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Appointment = require('./models/Appointment');
const WaitingList = require('./models/WaitingList');
const Incident = require('./models/Incident');
const Notification = require('./models/Notification');
const { createNotification } = require('./services/notificationService');
const {
  sendAppointmentEmail,
  sendAppointmentUpdateEmail,
  flushQueuedAppointmentEmails
} = require('./services/emailService');
const { sendAppointmentSms } = require('./services/smsService');
const PersistentSessionStore = require('./services/persistentSessionStore');
const {
  readRecentLogs,
  runSelfHealingScenario,
  runSelfHealingScenarios
} = require('./services/selfHealingScenarios');

const {
  startHealthMonitor,
  logIncident,
  getHealth,
  loadSelfHealingSetting,
  setSelfHealingEnabled,
  triggerChaos,
  recoverChaos
} = require('./services/selfHealing');

const app = express();
const PORT = process.env.PORT || 3000;
const doctorPhotoDirectory = path.join(__dirname, 'public', 'uploads', 'doctors');
fs.mkdirSync(doctorPhotoDirectory, { recursive: true });
const doctorPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: doctorPhotoDirectory,
    filename(req, file, callback) {
      const extensions = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp'
      };
      callback(null, `${crypto.randomUUID()}${extensions[file.mimetype]}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new Error('Upload a JPG, PNG or WebP profile photo.'));
    }

    return callback(null, true);
  }
});
const activeSelfHealingRuns = new Map();
let databaseReconnectTask = null;
const selfHealingScenarioNames = [
  'database-reconnect',
  'doctor-api',
  'network-connectivity',
  'booking-idempotency',
  'notification-adapter',
  'notification-delivery',
  'appointment-reconciliation'
];
// -------------------- TRANSLATION API --------------------

const translationCache = new Map();
const MAX_TRANSLATION_CACHE = 500;

async function translateWithMyMemory(text, source, target) {
  const cacheKey = `${source}:${target}:${text}`;

  // Reuse a previous translation to reduce API requests.
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  const params = new URLSearchParams({
    q: text,
    langpair: `${source}|${target}`
  });

  const response = await fetch(
    `https://api.mymemory.translated.net/get?${params.toString()}`,
    { signal: AbortSignal.timeout(8000) }
  );

  if (!response.ok) {
    throw new Error(`Translation API returned ${response.status}`);
  }

  const data = await response.json();

  if (
    data.responseStatus !== 200 ||
    typeof data.responseData?.translatedText !== 'string' ||
    !data.responseData.translatedText.trim()
  ) {
    throw new Error('Translation is unavailable');
  }

  const translatedText = data.responseData.translatedText;

  // Keep the cache bounded so it cannot grow indefinitely.
  if (translationCache.size >= MAX_TRANSLATION_CACHE) {
    const oldestKey = translationCache.keys().next().value;

    if (oldestKey !== undefined) {
      translationCache.delete(oldestKey);
    }
  }

  translationCache.set(cacheKey, translatedText);

  return translatedText;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const sessionOptions = {
  name: 'carenest.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
};

if (process.env.MONGODB_URI) {
  sessionOptions.store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 8 * 60 * 60
  });
}

const databaseSession = session(sessionOptions);
const fallbackSession = session({
  ...sessionOptions,
  name: 'carenest.fallback.sid',
  store: new session.MemoryStore()
});
const selfHealingSession = session({
  ...sessionOptions,
  name: 'carenest.healing.sid',
  store: new PersistentSessionStore(
    path.join(__dirname, 'data', 'self-healing-sessions.json')
  )
});

app.use((req, res, next) => {
  if (req.path.startsWith('/self-healing')) {
    return selfHealingSession(req, res, next);
  }

  const middleware = mongoose.connection.readyState === 1 || !process.env.MONGODB_URI
    ? databaseSession
    : fallbackSession;
  return middleware(req, res, next);
});

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.databaseAvailable = mongoose.connection.readyState === 1;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

const databaseIndependentPaths = new Set([
  '/',
  '/about',
  '/contact',
  '/doctor/login',
  '/doctor/register',
  '/login',
  '/register'
]);

app.use((req, res, next) => {
  const chaosActive = getHealth().chaosActive;
  const chaosControlRequest =
    req.path === '/health' ||
    req.path.startsWith('/self-healing');

  if (chaosActive && !chaosControlRequest) {
    const message = 'CareNest is in a simulated service outage. Turn self-healing on in the protected monitor to recover services.';
    if (req.accepts('html')) {
      return res.status(503).render('500', {
        title: 'Chaos Simulation Active'
      });
    }
    return res.status(503).json({ message });
  }

  const databaseIndependent =
    req.path === '/health' ||
    req.path === '/api/translate' ||
    req.path.startsWith('/self-healing') ||
    (req.method === 'GET' && databaseIndependentPaths.has(req.path));

  if (mongoose.connection.readyState === 1 || databaseIndependent) {
    return next();
  }

  const message = 'The database is currently unavailable. Database-backed pages and data are temporarily hidden.';
  if (req.accepts('html')) {
    return res.status(503).render('500', {
      title: 'Database Temporarily Unavailable'
    });
  }

  return res.status(503).json({ message });
});

// -------------------- TRANSLATION ROUTE --------------------

app.post('/api/translate', async (req, res) => {
  try {
    const text = req.body?.text;
    const source = req.body?.source;
    const target = req.body?.target;

    // Validate the text before sending it to the translation service.
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 500
    ) {
      return res.status(400).json({
        success: false,
        message: 'Text must contain between 1 and 500 characters.'
      });
    }

    // Only English and Hindi are currently supported.
    const supportedLanguages = ['en', 'hi'];

    if (
      !supportedLanguages.includes(source) ||
      !supportedLanguages.includes(target) ||
      source === target
    ) {
      return res.status(400).json({
        success: false,
        message: 'Supported languages are English and Hindi.'
      });
    }

    const translatedText = await translateWithMyMemory(
      text.trim(),
      source,
      target
    );

    return res.json({
      success: true,
      translatedText,
      source,
      target
    });

  } catch (error) {
    console.error('Translation API error:', error.message);

    return res.status(502).json({
      success: false,
      message: 'Translation service is temporarily unavailable.'
    });
  }
});
// -------------------- HELPERS --------------------

function flash(req, type, message, speechText) {
  req.session.flash = {
    type,
    message,
    ...(speechText ? { speechText } : {})
  };
}

function requirePatient(req, res, next) {
  if (!req.session.user) {
    flash(req, 'warning', 'Please sign in to continue.');
    return res.redirect('/login');
  }

  if (req.session.user.role !== 'patient') {
    if (req.session.user.role === 'doctor') {
      return res.redirect('/doctor/dashboard');
    }

    return res.redirect('/admin');
  }

  next();
}

function requireAdmin(req, res, next) {
  if (req.session.user?.role !== 'admin') {
    flash(req, 'warning', 'Admin access is required.');
    return res.redirect('/login');
  }

  next();
}

function selfHealingRequestError(req, res, status, message) {
  if (req.get('accept')?.includes('application/json')) {
    return res.status(status).json({ message });
  }

  return res.status(status).send(message);
}

function requireSelfHealingAdmin(req, res, next) {
  if (!req.session.selfHealingAdmin) {
    if (req.get('accept')?.includes('application/json')) {
      return selfHealingRequestError(
        req,
        res,
        401,
        'Your self-healing session expired. Sign in again and rerun the scenario.'
      );
    }
    return res.redirect('/self-healing/login');
  }

  next();
}

function safeCredentialMatch(value, expected) {
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function ensureSelfHealingCsrfToken(req) {
  if (!req.session.selfHealingCsrfToken) {
    req.session.selfHealingCsrfToken = crypto.randomBytes(32).toString('hex');
  }

  return req.session.selfHealingCsrfToken;
}

function validSelfHealingCsrfToken(req) {
  const submitted = Buffer.from(String(req.body.csrfToken || ''));
  const expected = Buffer.from(String(req.session.selfHealingCsrfToken || ''));

  return submitted.length === expected.length &&
    submitted.length > 0 &&
    crypto.timingSafeEqual(submitted, expected);
}

function requireDoctor(req, res, next) {
  if (!req.session.user) {
    flash(req, 'warning', 'Please sign in first.');
    return res.redirect('/login');
  }

  if (req.session.user.role !== 'doctor') {
    flash(req, 'error', 'Doctor access is required.');
    return res.redirect('/');
  }

  next();
}

async function dbReady(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    flash(req, 'error', 'The database is currently unavailable. Please try again when connectivity is restored.');
    return res.redirect('/');
  }

  next();
}

// -------------------- HOME & STATIC PAGES --------------------

app.get('/', async (req, res) => {
  let doctors = [];

  if (mongoose.connection.readyState === 1) {
    try {
      doctors = await Doctor.find({ active: true })
        .sort({ name: 1 })
        .limit(6)
        .lean();
    } catch (error) {
      await logIncident(
        'doctor-list-read',
        'warning',
        error.message,
        'Fallback: show empty doctor list'
      );
    }
  }

  res.render('home', {
    title: 'CareNest | Caring made simpler',
    doctors,
    health: getHealth()
  });
});

app.get('/about', (req, res) => {
  res.render('about', { title: 'About CareNest' });
});

app.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact CareNest' });
});

app.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    flash(req, 'error', 'Please fill in all fields.');
    return res.redirect('/contact');
  }

  try {
    await createNotification({
      type: 'contact',
      message: `${name} (${email}): ${message}`,
      status: 'unread'
    });

    flash(req, 'success', 'Your message has been saved.');
  } catch (error) {
    await logIncident(
      'contact-save',
      'warning',
      error.message,
      'Contact message could not be saved'
    );

    flash(req, 'error', 'We could not save your message right now.');
  }

  res.redirect('/contact');
});

// -------------------- AUTHENTICATION --------------------

app.get('/register', (req, res) => {
  res.render('auth', {
    title: 'Create patient account',
    mode: 'register'
  });
});

app.get('/login', (req, res) => {
  res.render('auth', {
    title: 'Sign in to CareNest',
    mode: 'login'
  });
});

app.get('/doctor/register', (req, res) => {
  if (req.session.user?.role === 'doctor') {
    return res.redirect('/doctor/dashboard');
  }

  res.render('doctor-auth', {
    title: 'Doctor Registration | CareNest',
    mode: 'register'
  });
});

app.get('/doctor/login', (req, res) => {
  if (req.session.user?.role === 'doctor') {
    return res.redirect('/doctor/dashboard');
  }

  res.render('doctor-auth', {
    title: 'Doctor Sign In | CareNest',
    mode: 'login'
  });
});

function removeDoctorPhoto(file) {
  if (!file) return Promise.resolve();

  return fs.promises.unlink(file.path).catch(error => {
    if (error.code !== 'ENOENT') {
      console.error('Doctor photo cleanup failed:', error.message);
    }
  });
}

function handleDoctorPhotoUpload(req, res, next, failurePath = '/doctor/register') {
  doctorPhotoUpload.single('profileImage')(req, res, error => {
    if (error) {
      const message = error instanceof multer.MulterError &&
        error.code === 'LIMIT_FILE_SIZE'
        ? 'Profile photos must be 5 MB or smaller.'
        : error.message;
      flash(req, 'error', message);
      return res.redirect(failurePath);
    }

    next();
  });
}

function removeStoredDoctorPhoto(imageUrl) {
  const match = /^\/uploads\/doctors\/([a-f0-9-]+\.(?:jpg|png|webp))$/i.exec(imageUrl || '');
  if (!match) return Promise.resolve();

  return fs.promises.unlink(path.join(doctorPhotoDirectory, match[1])).catch(error => {
    if (error.code !== 'ENOENT') {
      console.error('Previous doctor photo cleanup failed:', error.message);
    }
  });
}

app.post('/doctor/register', handleDoctorPhotoUpload, async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const specialty = String(req.body.specialty || '').trim();
  const education = String(req.body.education || '').trim();
  const experienceInput = String(req.body.experience || '').trim();
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  const experience = Number(experienceInput);

  if (
    fullName.length < 2 ||
    fullName.length > 80 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 254 ||
    phone.length < 7 ||
    phone.length > 18 ||
    specialty.length < 2 ||
    specialty.length > 100 ||
    !education ||
    education.length > 500 ||
    !/^\d{1,2}$/.test(experienceInput) ||
    !Number.isInteger(experience) ||
    experience < 0 ||
    experience > 60 ||
    password.length < 8 ||
    password.length > 128 ||
    password !== confirmPassword
  ) {
    await removeDoctorPhoto(req.file);
    flash(req, 'error', 'Check your profile details and password. Passwords must match and contain at least 8 characters.');
    return res.redirect('/doctor/register');
  }

  if (!req.file) {
    flash(req, 'error', 'Please upload your doctor profile photo.');
    return res.redirect('/doctor/register');
  }

  let user;

  try {
    user = await User.create({
      fullName,
      email,
      phone,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'doctor'
    });

    try {
      await Doctor.create({
        userId: user._id,
        name: fullName,
        specialty,
        education,
        experience,
        imageUrl: `/uploads/doctors/${req.file.filename}`
      });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }

    flash(req, 'success', 'Doctor profile created. Sign in to set your appointment schedule.');
    return res.redirect('/doctor/login');
  } catch (error) {
    await removeDoctorPhoto(req.file);

    if (error.code === 11000) {
      flash(req, 'error', 'An account already exists for that email address.');
      return res.redirect('/doctor/register');
    }

    await logIncident(
      'doctor-registration',
      'error',
      error.message,
      'Doctor registration failed safely'
    );
    flash(req, 'error', 'We could not create your doctor profile. Please try again.');
    return res.redirect('/doctor/register');
  }
});

app.post('/doctor/login', async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      flash(req, 'error', 'The database is currently unavailable. Please try again when connectivity is restored.');
      return res.redirect('/doctor/login');
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email }).select('+passwordHash');

    if (
      !user ||
      user.role !== 'doctor' ||
      !(await Doctor.exists({ userId: user._id, active: true }))
    ) {
      flash(req, 'error', 'Doctor email or password is incorrect.');
      return res.redirect('/doctor/login');
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      flash(req, 'error', `Account temporarily locked. Try again after ${new Date(user.lockUntil).toLocaleTimeString()}.`);
      return res.redirect('/doctor/login');
    }

    if (user.lockUntil && user.lockUntil <= Date.now()) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 10 * 60 * 1000);
        user.failedLoginAttempts = 0;
      }

      await user.save();
      flash(
        req,
        'error',
        user.lockUntil
          ? 'Too many failed attempts. Account locked for 10 minutes.'
          : 'Doctor email or password is incorrect.'
      );
      return res.redirect('/doctor/login');
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    req.session.regenerate(error => {
      if (error) return next(error);

      req.session.user = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: 'doctor'
      };

      req.session.save(saveError => {
        if (saveError) return next(saveError);
        res.redirect('/doctor/dashboard');
      });
    });
  } catch (error) {
    await logIncident(
      'doctor-login',
      'error',
      error.message,
      'Doctor sign-in failed safely'
    );
    flash(req, 'error', 'Sign in failed. Please try again.');
    return res.redirect('/doctor/login');
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        message: 'The database is currently unavailable. Please try again when connectivity is restored.'
      });
    }

    const fullName = String(req.body.fullName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');

    if (
      fullName.length < 2 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      phone.length < 7 ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: 'Enter a valid name, email, phone number and password of at least 8 characters.'
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        message: 'An account with this email already exists.'
      });
    }

    const user = await User.create({
      fullName,
      email,
      phone,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'patient'
    });

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({
          message: 'Could not start a secure session.'
        });
      }

      req.session.user = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      };

      req.session.save(saveError => {
        if (saveError) {
          return res.status(500).json({
            message: 'Could not save your session.'
          });
        }

        res.json({
          message: 'Account created successfully.',
          redirect: '/dashboard'
        });
      });
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'An account with this email already exists.'
      });
    }

    await logIncident(
      'register-failure',
      'error',
      error.message,
      'Registration failed safely'
    );

    res.status(500).json({
      message: 'Registration failed. Please try again.'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        message: 'The database is currently unavailable. Please try again when connectivity is restored.'
      });
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email }).select('+passwordHash');

    if (!user) {
      return res.status(401).json({
        message: 'Email or password is incorrect.'
      });
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(423).json({
        message: `Account temporarily locked. Try again after ${new Date(user.lockUntil).toLocaleTimeString()}.`
      });
    }

    if (user.lockUntil && user.lockUntil <= Date.now()) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
    }

    const passwordCorrect = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordCorrect) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 10 * 60 * 1000);
        user.failedLoginAttempts = 0;
      }

      await user.save();

      if (user.lockUntil) {
        return res.status(423).json({
          message: 'Too many failed attempts. Account locked for 10 minutes.'
        });
      }

      return res.status(401).json({
        message: 'Email or password is incorrect.'
      });
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    const redirect =
      user.role === 'admin'
        ? '/admin'
        : user.role === 'doctor'
          ? '/doctor/dashboard'
          : '/dashboard';

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({
          message: 'Could not start a secure session.'
        });
      }

      req.session.user = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      };

      req.session.save(saveError => {
        if (saveError) {
          return res.status(500).json({
            message: 'Could not save your session.'
          });
        }

        res.json({
          message: 'Welcome back!',
          redirect
        });
      });
    });
  } catch (error) {
    await logIncident(
      'login-failure',
      'error',
      error.message,
      'Login failed safely'
    );

    res.status(500).json({
      message: 'Sign in failed. Please try again.'
    });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// -------------------- PATIENT DASHBOARD --------------------

app.get('/dashboard', requirePatient, async (req, res) => {
  let appointments = [];
  let notifications = [];
  let doctors = [];

  try {
    appointments = await Appointment.find({
      patientId: req.session.user.id
    })
      .populate('doctorId')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    notifications = await Notification.find({
      userId: req.session.user.id
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    doctors = await Doctor.find({ active: true })
      .sort({ name: 1 })
      .lean();
  } catch (error) {
    await logIncident(
      'dashboard-load',
      'warning',
      error.message,
      'Dashboard displays a safe fallback'
    );
  }

  res.render('dashboard', {
    title: 'Patient Dashboard',
    appointments,
    notifications,
    doctors
  });
});

// -------------------- DOCTOR DIRECTORY --------------------

app.get('/doctors', async (req, res) => {
  let doctors = [];

  try {
    doctors = await Doctor.find({ active: true })
      .sort({ name: 1 })
      .lean();
  } catch (error) {
    await logIncident(
      'doctor-list-read',
      'warning',
      error.message,
      'Fallback: empty doctor list'
    );
  }

  res.render('doctors', {
    title: 'Our Doctors',
    doctors
  });
});

// -------------------- DOCTOR DASHBOARD --------------------

app.get('/doctor/dashboard', requireDoctor, async (req, res) => {
  try {
    const doctor = await Doctor.findOne({
      userId: req.session.user.id,
      active: true
    }).lean();

    if (!doctor) {
      flash(
        req,
        'error',
        'Your doctor profile is not linked to this account. Contact the administrator.'
      );

      return res.redirect('/');
    }

    const appointments = await Appointment.find({
      doctorId: doctor._id
    })
      .populate('patientId', 'fullName email phone')
      .sort({ appointmentDate: 1 })
      .limit(100)
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAppointments = appointments.filter(appointment => {
      const date = new Date(appointment.appointmentDate);

      return appointment.status === 'booked' &&
        date >= today &&
        date < tomorrow;
    });

    res.render('doctordashboard', {
      title: 'Doctor Dashboard | CareNest',
      doctor,
      appointments,
      todayAppointments
    });
  } catch (error) {
    console.error('Doctor dashboard error:', error.message);

    await logIncident(
      'doctor-dashboard',
      'error',
      error.message,
      'Dashboard request failed safely'
    );

    res.status(500).render('500', {
      title: 'Doctor Dashboard'
    });
  }
});

app.get('/doctor/profile/edit', requireDoctor, async (req, res) => {
  try {
    const doctor = await Doctor.findOne({
      userId: req.session.user.id,
      active: true
    }).lean();

    if (!doctor) {
      flash(req, 'error', 'Doctor profile is not linked to this account.');
      return res.redirect('/doctor/dashboard');
    }

    return res.render('doctor-profile-edit', {
      title: 'Edit Doctor Profile | CareNest',
      doctor,
      imageUrl: doctor.imageUrl || doctor.profileImage || ''
    });
  } catch (error) {
    await logIncident(
      'doctor-profile-edit-load',
      'error',
      error.message,
      'Doctor profile edit page failed to load'
    );
    flash(req, 'error', 'Could not load your profile right now.');
    return res.redirect('/doctor/dashboard');
  }
});

app.post(
  '/doctor/profile/edit',
  requireDoctor,
  (req, res, next) => handleDoctorPhotoUpload(req, res, next, '/doctor/profile/edit'),
  async (req, res) => {
    const name = String(req.body.name || '').trim();
    const education = String(req.body.education || '').trim();

    if (name.length < 2 || name.length > 80 || !education || education.length > 500) {
      await removeDoctorPhoto(req.file);
      flash(req, 'error', 'Enter a name between 2 and 80 characters and qualifications up to 500 characters.');
      return res.redirect('/doctor/profile/edit');
    }

    let doctorProfileSaved = false;

    try {
      const doctor = await Doctor.findOne({
        userId: req.session.user.id,
        active: true
      });

      if (!doctor) {
        await removeDoctorPhoto(req.file);
        flash(req, 'error', 'Doctor profile is not linked to this account.');
        return res.redirect('/doctor/dashboard');
      }

      const previousImageUrl = doctor.imageUrl || doctor.profileImage || '';
      const updatedImageUrl = req.file
        ? `/uploads/doctors/${req.file.filename}`
        : previousImageUrl;

      doctor.name = name;
      doctor.education = education;
      doctor.imageUrl = updatedImageUrl;
      doctor.profileImage = updatedImageUrl;
      await doctor.save();
      doctorProfileSaved = true;

      await User.updateOne(
        { _id: req.session.user.id, role: 'doctor' },
        { $set: { fullName: name } }
      );
      req.session.user.fullName = name;

      if (req.file && previousImageUrl && previousImageUrl !== updatedImageUrl) {
        await removeStoredDoctorPhoto(previousImageUrl);
      }

      flash(req, 'success', 'Your doctor profile has been updated.');
      return res.redirect('/doctor/dashboard');
    } catch (error) {
      if (!doctorProfileSaved) {
        await removeDoctorPhoto(req.file);
      }
      await logIncident(
        'doctor-profile-edit',
        'error',
        error.message,
        'Doctor profile update failed'
      );
      flash(req, 'error', 'Could not update your profile. Please try again.');
      return res.redirect('/doctor/profile/edit');
    }
  }
);

app.post('/doctor/appointments/:id/reschedule', requireDoctor, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      flash(req, 'error', 'Appointment not found.');
      return res.redirect('/doctor/dashboard');
    }

    const doctor = await Doctor.findOne({
      userId: req.session.user.id,
      active: true
    });

    if (!doctor) {
      flash(req, 'error', 'Doctor profile is not linked to this account.');
      return res.redirect('/doctor/dashboard');
    }

    const appointment = await Appointment.findOne({
      _id: req.params.id,
      doctorId: doctor._id,
      status: 'booked',
      appointmentDate: { $gt: new Date() }
    }).populate('patientId', 'fullName email');

    if (!appointment) {
      flash(req, 'error', 'Only your upcoming booked appointments can be rescheduled.');
      return res.redirect('/doctor/dashboard');
    }

    const day = String(req.body.appointmentDay || '');
    const time = String(req.body.appointmentTime || '');
    const date = isValidAppointmentDay(day) &&
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(time)
      ? new Date(`${day}T${time}:00`)
      : new Date(NaN);

    if (Number.isNaN(date.getTime()) || date <= new Date()) {
      flash(req, 'error', 'Choose a valid future date and time.');
      return res.redirect('/doctor/dashboard');
    }

    const weekdayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];

    if (
      !(doctor.workingDays || []).includes(weekdayNames[date.getDay()]) ||
      !getDoctorSlotTimes(doctor).includes(time)
    ) {
      flash(req, 'error', 'That time is not in your available schedule.');
      return res.redirect('/doctor/dashboard');
    }

    const slotEnd = new Date(date.getTime() + 60 * 60 * 1000);
    const slotStart = new Date(date.getTime() - 60 * 60 * 1000);
    const conflictingAppointment = await Appointment.findOne({
      _id: { $ne: appointment._id },
      doctorId: doctor._id,
      appointmentDate: { $gt: slotStart, $lt: slotEnd },
      status: 'booked'
    }).lean();

    if (conflictingAppointment) {
      flash(req, 'error', 'You already have an appointment at this time. Choose another slot.');
      return res.redirect('/doctor/dashboard');
    }

    appointment.appointmentDate = date;
    await appointment.save();

    let inAppNotified = false;
    try {
      await createNotification({
        userId: appointment.patientId._id,
        type: 'appointment',
        message: `Dr. ${doctor.name} rescheduled your appointment to ${date.toLocaleString()}.`
      });
      inAppNotified = true;
    } catch (notificationError) {
      await logIncident(
        'doctor-appointment-reschedule-notification',
        'warning',
        notificationError.message,
        `Rescheduling for booking ${appointment.bookingId} was saved but notification failed`
      );
    }

    let emailSent = false;
    let emailQueued = false;
    try {
      const delivery = await sendAppointmentUpdateEmail({
        to: appointment.patientId.email,
        bookingId: appointment.bookingId,
        patientName: appointment.patientName,
        doctorName: doctor.name,
        appointmentDate: date,
        action: 'rescheduled'
      });
      emailQueued = delivery.queued;
      emailSent = !delivery.queued;
    } catch (emailError) {
      await logIncident(
        'doctor-appointment-reschedule-email',
        'warning',
        emailError.message,
        `Rescheduling for booking ${appointment.bookingId} was saved but email delivery failed`
      );
    }

    flash(
      req,
      emailSent || inAppNotified ? 'success' : 'warning',
      emailSent
        ? 'Appointment rescheduled and an email notification was sent to the patient.'
        : emailQueued
          ? 'Appointment rescheduled. The email is queued and will be sent when self-healing is turned on.'
        : inAppNotified
          ? 'Appointment rescheduled and an in-app notification was saved, but the email could not be sent.'
          : 'Appointment rescheduled, but email and in-app notifications could not be delivered.',
      'Your appointment is Reschedule'
    );
  } catch (error) {
    await logIncident(
      'doctor-appointment-reschedule',
      'error',
      error.message,
      'Doctor rescheduling failed safely'
    );
    flash(req, 'error', 'Could not reschedule this appointment right now.');
  }

  return res.redirect('/doctor/dashboard');
});

app.post('/doctor/appointments/:id/cancel', requireDoctor, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      flash(req, 'error', 'Appointment not found.');
      return res.redirect('/doctor/dashboard');
    }

    const doctor = await Doctor.findOne({
      userId: req.session.user.id,
      active: true
    });

    if (!doctor) {
      flash(req, 'error', 'Doctor profile is not linked to this account.');
      return res.redirect('/doctor/dashboard');
    }

    const appointment = await Appointment.findOne({
      _id: req.params.id,
      doctorId: doctor._id,
      status: 'booked',
      appointmentDate: { $gt: new Date() }
    }).populate('patientId', 'fullName email');

    if (!appointment) {
      flash(req, 'error', 'Only your upcoming booked appointments can be cancelled.');
      return res.redirect('/doctor/dashboard');
    }

    appointment.status = 'cancelled';
    await appointment.save();

    let inAppNotified = false;
    try {
      await createNotification({
        userId: appointment.patientId._id,
        type: 'appointment',
        message: `Dr. ${doctor.name} cancelled your appointment scheduled for ${appointment.appointmentDate.toLocaleString()}.`
      });
      inAppNotified = true;
    } catch (notificationError) {
      await logIncident(
        'doctor-appointment-cancel-notification',
        'warning',
        notificationError.message,
        `Cancellation for booking ${appointment.bookingId} was saved but notification failed`
      );
    }

    let emailSent = false;
    let emailQueued = false;
    try {
      const delivery = await sendAppointmentUpdateEmail({
        to: appointment.patientId.email,
        bookingId: appointment.bookingId,
        patientName: appointment.patientName,
        doctorName: doctor.name,
        appointmentDate: appointment.appointmentDate,
        action: 'cancelled'
      });
      emailQueued = delivery.queued;
      emailSent = !delivery.queued;
    } catch (emailError) {
      await logIncident(
        'doctor-appointment-cancel-email',
        'warning',
        emailError.message,
        `Cancellation for booking ${appointment.bookingId} was saved but email delivery failed`
      );
    }

    flash(
      req,
      emailSent || inAppNotified ? 'success' : 'warning',
      emailSent
        ? 'Appointment cancelled and an email notification was sent to the patient.'
        : emailQueued
          ? 'Appointment cancelled. The email is queued and will be sent when self-healing is turned on.'
        : inAppNotified
          ? 'Appointment cancelled and an in-app notification was saved, but the email could not be sent.'
          : 'Appointment cancelled, but email and in-app notifications could not be delivered.'
    );
  } catch (error) {
    await logIncident(
      'doctor-appointment-cancel',
      'error',
      error.message,
      'Doctor cancellation failed safely'
    );
    flash(req, 'error', 'Could not cancel this appointment right now.');
  }

  return res.redirect('/doctor/dashboard');
});

// -------------------- DOCTOR SCHEDULE PAGE --------------------

app.get('/doctor/schedule', requireDoctor, async (req, res) => {
  try {
    const doctor = await Doctor.findOne({
      userId: req.session.user.id,
      active: true
    }).lean();

    if (!doctor) {
      flash(req, 'error', 'Doctor profile is not linked to this account.');
      return res.redirect('/doctor/dashboard');
    }

    res.render('doctor-schedule', {
      title: 'Manage Availability | CareNest',
      doctor
    });
  } catch (error) {
    await logIncident(
      'doctor-schedule',
      'error',
      error.message,
      'Schedule page failed safely'
    );

    res.status(500).render('500', {
      title: 'Schedule Error'
    });
  }
});

app.post('/doctor/schedule', requireDoctor, async (req, res) => {
  try {
    const doctor = await Doctor.findOne({
      userId: req.session.user.id,
      active: true
    });

    if (!doctor) {
      flash(req, 'error', 'Doctor profile is not linked to this account.');
      return res.redirect('/doctor/dashboard');
    }

    const validDays = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday'
    ];

    let workingDays = req.body.workingDays || [];

    if (!Array.isArray(workingDays)) {
      workingDays = [workingDays];
    }

    workingDays = [...new Set(workingDays)];

    const startTime = String(req.body.startTime || '');
    const endTime = String(req.body.endTime || '');
    const slotTimesInput = String(req.body.slotTimes || '');

    const validTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const slotTimes = slotTimesInput
      .split(',')
      .map(time => time.trim())
      .filter(Boolean);
    const sortedSlotTimes = [...slotTimes].sort();
    const hasDuplicateSlotTimes = new Set(slotTimes).size !== slotTimes.length;
    const endMinutes = validTimePattern.test(endTime)
      ? timeToMinutes(endTime)
      : 0;

    if (
      workingDays.length === 0 ||
      workingDays.some(day => !validDays.includes(day)) ||
      !validTimePattern.test(startTime) ||
      !validTimePattern.test(endTime) ||
      startTime >= endTime ||
      hasDuplicateSlotTimes ||
      sortedSlotTimes.some((time, index) =>
        !validTimePattern.test(time) ||
        time < startTime ||
        timeToMinutes(time) + 60 > endMinutes ||
        (index > 0 &&
          timeToMinutes(time) - timeToMinutes(sortedSlotTimes[index - 1]) < 60)
      )
    ) {
      flash(
        req,
        'error',
        'Select working days, enter valid clinic hours, and check that appointment times are unique and within those hours.'
      );

      return res.redirect('/doctor/schedule');
    }

    doctor.workingDays = workingDays;
    doctor.startTime = startTime;
    doctor.endTime = endTime;
    doctor.slotTimes = sortedSlotTimes;

    // Keep the existing availability field compatible with older pages.
    doctor.availability =
      `${workingDays.join(', ')}, ${startTime}â€“${endTime}`;

    await doctor.save();

    flash(req, 'success', 'Your weekly schedule has been saved successfully.');
    return res.redirect('/doctor/schedule');

  } catch (error) {
    console.error('Doctor schedule save error:', error.message);

    await logIncident(
      'doctor-schedule-save',
      'error',
      error.message,
      'Schedule save failed safely; doctor can retry'
    );

    flash(req, 'error', 'Schedule could not be saved. Please try again.');
    return res.redirect('/doctor/schedule');
  }
});

// -------------------- APPOINTMENT BOOKING --------------------

function timeToMinutes(time) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function isValidAppointmentDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;

  const date = new Date(`${day}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === day;
}

function getDoctorSlotTimes(doctor) {
  if (Array.isArray(doctor.slotTimes) && doctor.slotTimes.length) {
    return doctor.slotTimes.filter(time =>
      typeof time === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time)
    );
  }

  if (
    typeof doctor.startTime !== 'string' ||
    typeof doctor.endTime !== 'string' ||
    !/^([01]\d|2[0-3]):([0-5]\d)$/.test(doctor.startTime) ||
    !/^([01]\d|2[0-3]):([0-5]\d)$/.test(doctor.endTime) ||
    doctor.startTime >= doctor.endTime
  ) {
    return [];
  }

  const startMinutes = Number(doctor.startTime.slice(0, 2)) * 60 +
    Number(doctor.startTime.slice(3, 5));
  const endMinutes = Number(doctor.endTime.slice(0, 2)) * 60 +
    Number(doctor.endTime.slice(3, 5));
  const slots = [];

  for (let minutes = startMinutes; minutes + 60 <= endMinutes; minutes += 60) {
    slots.push(
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    );
  }

  return slots;
}

app.get('/api/doctors/:doctorId/availability', requirePatient, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date: day, appointmentId } = req.query;

    if (
      !mongoose.isValidObjectId(doctorId) ||
      !isValidAppointmentDay(day) ||
      (appointmentId !== undefined && !mongoose.isValidObjectId(appointmentId))
    ) {
      return res.status(400).json({
        message: 'Choose a valid doctor and appointment date.'
      });
    }

    const excludedAppointment = appointmentId
      ? await Appointment.findOne({
        _id: appointmentId,
        patientId: req.session.user.id,
        status: 'booked',
        appointmentDate: { $gt: new Date() }
      }).select('_id').lean()
      : null;

    if (appointmentId && !excludedAppointment) {
      return res.status(404).json({
        message: 'That appointment cannot be rescheduled.'
      });
    }

    const doctor = await Doctor.findOne({
      _id: doctorId,
      active: true
    }).lean();

    if (!doctor) {
      return res.status(404).json({
        message: 'That doctor is not currently available.'
      });
    }

    const date = new Date(`${day}T00:00:00`);
    const weekdayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];

    if (!(doctor.workingDays || []).includes(weekdayNames[date.getDay()])) {
      return res.json({
        slots: [],
        message: 'This doctor does not take appointments on the selected day.'
      });
    }

    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const appointmentQuery = {
      doctorId: doctor._id,
      appointmentDate: { $gte: date, $lt: nextDay },
      status: 'booked'
    };

    if (excludedAppointment) {
      appointmentQuery._id = { $ne: excludedAppointment._id };
    }

    const appointments = await Appointment.find(appointmentQuery)
      .select('appointmentDate')
      .lean();
    const now = new Date();
    const slots = getDoctorSlotTimes(doctor).filter(time => {
      const slotDate = new Date(`${day}T${time}:00`);
      return slotDate > now && !appointments.some(appointment => {
        const bookedDate = new Date(appointment.appointmentDate);
        return bookedDate < new Date(slotDate.getTime() + 60 * 60 * 1000) &&
          new Date(bookedDate.getTime() + 60 * 60 * 1000) > slotDate;
      });
    });

    return res.json({
      slots,
      message: slots.length
        ? `${slots.length} appointment time${slots.length === 1 ? '' : 's'} available.`
        : 'No appointment times are available on this date.'
    });
  } catch (error) {
    await logIncident(
      'appointment-availability',
      'error',
      error.message,
      'Appointment time lookup failed safely'
    );

    return res.status(500).json({
      message: 'Could not load appointment times. Please try again.'
    });
  }
});

app.get('/booking', (req, res) => res.redirect('/appointments/new'));

app.get('/appointments/new', requirePatient, async (req, res) => {
  let doctors = [];

  try {
    doctors = await Doctor.find({ active: true })
      .sort({ name: 1 })
      .lean();
  } catch (error) {
    await logIncident(
      'appointment-form-doctors',
      'warning',
      error.message,
      'Booking form can be retried'
    );
  }

  res.render('appointment-form', {
    title: 'Book an Appointment',
    doctors,
    appointment: null
  });
});

app.get('/appointments/:id/reschedule', requirePatient, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      flash(req, 'error', 'Appointment not found.');
      return res.redirect('/appointments');
    }

    const appointment = await Appointment.findOne({
      _id: req.params.id,
      patientId: req.session.user.id,
      status: 'booked',
      appointmentDate: { $gt: new Date() }
    }).lean();

    if (!appointment) {
      flash(req, 'error', 'Only upcoming booked appointments can be rescheduled.');
      return res.redirect('/appointments');
    }

    const doctors = await Doctor.find({ active: true })
      .sort({ name: 1 })
      .lean();

    res.render('appointment-form', {
      title: 'Reschedule Appointment',
      doctors,
      appointment
    });
  } catch (error) {
    await logIncident(
      'appointment-reschedule-form',
      'error',
      error.message,
      'Reschedule form could not be loaded'
    );
    flash(req, 'error', 'Could not load this appointment for rescheduling.');
    return res.redirect('/appointments');
  }
});

app.post('/appointments', requirePatient, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await logIncident(
        'appointment-create-db',
        'error',
        'MongoDB not ready',
        'Booking request was rejected safely'
      );

      flash(req, 'error', 'Booking service is temporarily unavailable.');
      return res.redirect('/appointments/new');
    }

    const {
      doctorId,
      appointmentDay: requestedDay,
      appointmentTime: requestedTime,
      appointmentDate: legacyAppointmentDate,
      reason,
      patientName,
      relationship
    } = req.body;

    let appointmentDay = String(requestedDay || '');
    let appointmentTime = String(requestedTime || '');

    if (!appointmentDay && legacyAppointmentDate) {
      const legacyDate = new Date(legacyAppointmentDate);

      if (!Number.isNaN(legacyDate.getTime())) {
        appointmentDay = [
          legacyDate.getFullYear(),
          String(legacyDate.getMonth() + 1).padStart(2, '0'),
          String(legacyDate.getDate()).padStart(2, '0')
        ].join('-');
        appointmentTime = `${String(legacyDate.getHours()).padStart(2, '0')}:${String(legacyDate.getMinutes()).padStart(2, '0')}`;
      }
    }

    const date = isValidAppointmentDay(appointmentDay) &&
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(appointmentTime)
      ? new Date(`${appointmentDay}T${appointmentTime}:00`)
      : new Date(NaN);

    if (
      !doctorId ||
      !appointmentDay ||
      !appointmentTime ||
      Number.isNaN(date.getTime()) ||
      date <= new Date() ||
      !mongoose.isValidObjectId(doctorId)
    ) {
      flash(req, 'error', 'Choose a valid doctor and future date/time.');
      return res.redirect('/appointments/new');
    }

    const doctor = await Doctor.findOne({
      _id: doctorId,
      active: true
    });

    if (!doctor) {
      flash(req, 'error', 'That doctor is not currently available.');
      return res.redirect('/appointments/new');
    }

    const weekdayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];
    const hasDoctorAvailability =
      (doctor.workingDays || []).includes(weekdayNames[date.getDay()]) &&
      getDoctorSlotTimes(doctor).includes(appointmentTime);

    if (!hasDoctorAvailability) {
      flash(req, 'error', 'That time is not in the doctor’s available schedule.');
      return res.redirect('/appointments/new');
    }

    const slotEnd = new Date(date.getTime() + 60 * 60 * 1000);
    const slotStart = new Date(date.getTime() - 60 * 60 * 1000);

    // Each appointment occupies a one-hour window, including adjacent generated slots.
    const existingAppointment = await Appointment.findOne({
      doctorId: doctor._id,
      appointmentDate: { $gt: slotStart, $lt: slotEnd },
      status: 'booked'
    }).lean();

    if (existingAppointment) {
      await logIncident(
        'duplicate-appointment-attempt',
        'warning',
        `Duplicate slot requested for doctor ${doctor._id} at ${date.toISOString()}`,
        'Booking rejected because this doctor already has a booked appointment overlapping the selected hour'
      );

      flash(
        req,
        'error',
        'This doctor already has an appointment at that time. Please choose another date or time.'
      );

      return res.redirect('/appointments/new');
    }

    const appointment = await Appointment.create({
      patientId: req.session.user.id,
      doctorId: doctor._id,
      patientName: String(
        patientName || req.session.user.fullName
      ).trim(),
      relationship: String(relationship || 'Self').trim(),
      appointmentDate: date,
      reason: String(reason || 'General consultation').trim(),
      status: 'booked'
    });

    // A notification failure must not make a successful booking look failed.
    try {
      await createNotification({
        userId: req.session.user.id,
        type: 'appointment',
        message: `Appointment booked with ${doctor.name} for ${date.toLocaleString()}.`
      });
    } catch (notificationError) {
      await logIncident(
        'appointment-notification',
        'warning',
        notificationError.message,
        `Booking ${appointment.bookingId} was saved but notification delivery failed`
      );
    }

    // SMS dry-run: booking is already saved; SMS errors must not undo it.
    try {
      await sendAppointmentSms({
        bookingId: appointment.bookingId,
        patientName: appointment.patientName,
        doctorName: doctor.name,
        appointmentDate: appointment.appointmentDate
      });
    } catch (smsError) {
      console.error('APPOINTMENT SMS DRY-RUN ERROR:', smsError.message);
      try {
        await logIncident(
          'appointment-sms',
          'warning',
          smsError.message,
          `Booking ${appointment.bookingId} was saved; SMS preview failed`
        );
      } catch (incidentError) {
        console.error('SMS INCIDENT LOG ERROR:', incidentError.message);
      }
    }

    let emailSent = false;
    let emailQueued = false;

    try {
      const delivery = await sendAppointmentEmail({
        to: req.session.user.email,
        bookingId: appointment.bookingId,
        patientName: appointment.patientName,
        doctorName: doctor.name,
        appointmentDate: appointment.appointmentDate
      });
      emailQueued = delivery.queued;
      emailSent = !delivery.queued;
    } catch (emailError) {
      console.error('APPOINTMENT EMAIL ERROR:', emailError.message);
      try {
        await logIncident(
          'appointment-email',
          'warning',
          emailError.message,
          `Booking ${appointment.bookingId} was saved but confirmation email was not sent`
        );
      } catch (incidentError) {
        console.error('EMAIL INCIDENT LOG ERROR:', incidentError.message);
      }
    }

    flash(
      req,
      'success',
      emailSent
        ? 'Appointment booked successfully. A confirmation email has been sent.'
        : emailQueued
          ? 'Appointment booked successfully. The confirmation email is queued until self-healing is turned on.'
        : 'Appointment booked successfully, but the confirmation email could not be sent.',
      'Your Appointment is Book'
    );
    return res.redirect('/appointments');

  } catch (error) {
    console.error('APPOINTMENT BOOKING ERROR:', error);

    if (error.code === 11000) {
      await logIncident(
        'duplicate-appointment-attempt',
        'warning',
        error.message,
        'Conflicting booking rejected by database uniqueness protection'
      );

      flash(
        req,
        'error',
        'This slot is already booked. Please choose another date or time.'
      );

      return res.redirect('/appointments/new');
    }

    await logIncident(
      'appointment-create',
      'error',
      error.message,
      'Booking failed safely; patient can retry'
    );

    flash(
      req,
      'error',
      'We could not complete the booking. Please try again.'
    );

    return res.redirect('/appointments/new');
  }
});

// -------------------- APPOINTMENT HISTORY --------------------

app.get('/appointments', requirePatient, async (req, res) => {
  let appointments = [];

  try {
    appointments = await Appointment.find({
      patientId: req.session.user.id
    })
      .populate('doctorId')
      .sort({ appointmentDate: -1 })
      .lean();
  } catch (error) {
    await logIncident(
      'appointment-list',
      'warning',
      error.message,
      'Appointment history fallback'
    );

    flash(req, 'error', 'Appointment history is temporarily unavailable.');
  }

  res.render('appointments', {
    title: 'My Appointments',
    appointments
  });
});

app.post('/appointments/:id/reschedule', requirePatient, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await logIncident(
        'appointment-reschedule-db',
        'error',
        'MongoDB not ready',
        'Rescheduling request was rejected safely'
      );
      flash(req, 'error', 'Booking service is temporarily unavailable.');
      return res.redirect('/appointments');
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      flash(req, 'error', 'Appointment not found.');
      return res.redirect('/appointments');
    }

    const appointment = await Appointment.findOne({
      _id: req.params.id,
      patientId: req.session.user.id,
      status: 'booked',
      appointmentDate: { $gt: new Date() }
    });

    if (!appointment) {
      flash(req, 'error', 'Only upcoming booked appointments can be rescheduled.');
      return res.redirect('/appointments');
    }

    const { doctorId, appointmentDay, appointmentTime } = req.body;
    const date = isValidAppointmentDay(String(appointmentDay || '')) &&
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(appointmentTime || ''))
      ? new Date(`${appointmentDay}T${appointmentTime}:00`)
      : new Date(NaN);

    if (
      !doctorId ||
      !mongoose.isValidObjectId(doctorId) ||
      Number.isNaN(date.getTime()) ||
      date <= new Date()
    ) {
      flash(req, 'error', 'Choose a valid doctor and future date/time.');
      return res.redirect(`/appointments/${appointment._id}/reschedule`);
    }

    const doctor = await Doctor.findOne({
      _id: doctorId,
      active: true
    });

    if (!doctor) {
      flash(req, 'error', 'That doctor is not currently available.');
      return res.redirect(`/appointments/${appointment._id}/reschedule`);
    }

    const weekdayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];
    const hasDoctorAvailability =
      (doctor.workingDays || []).includes(weekdayNames[date.getDay()]) &&
      getDoctorSlotTimes(doctor).includes(appointmentTime);

    if (!hasDoctorAvailability) {
      flash(req, 'error', 'That time is not in the doctor’s available schedule.');
      return res.redirect(`/appointments/${appointment._id}/reschedule`);
    }

    const slotEnd = new Date(date.getTime() + 60 * 60 * 1000);
    const slotStart = new Date(date.getTime() - 60 * 60 * 1000);
    const conflictingAppointment = await Appointment.findOne({
      _id: { $ne: appointment._id },
      doctorId: doctor._id,
      appointmentDate: { $gt: slotStart, $lt: slotEnd },
      status: 'booked'
    }).lean();

    if (conflictingAppointment) {
      flash(req, 'error', 'That doctor already has an appointment at this time. Choose another slot.');
      return res.redirect(`/appointments/${appointment._id}/reschedule`);
    }

    appointment.doctorId = doctor._id;
    appointment.appointmentDate = date;
    await appointment.save();

    let inAppNotified = false;
    try {
      await createNotification({
        userId: req.session.user.id,
        type: 'appointment',
        message: `Your appointment with ${doctor.name} has been rescheduled to ${date.toLocaleString()}.`
      });
      inAppNotified = true;
    } catch (notificationError) {
      await logIncident(
        'appointment-reschedule-notification',
        'warning',
        notificationError.message,
        `Rescheduling for booking ${appointment.bookingId} was saved but notification failed`
      );
    }

    let emailSent = false;
    let emailQueued = false;
    try {
      const delivery = await sendAppointmentUpdateEmail({
        to: req.session.user.email,
        bookingId: appointment.bookingId,
        patientName: appointment.patientName,
        doctorName: doctor.name,
        appointmentDate: date,
        action: 'rescheduled'
      });
      emailQueued = delivery.queued;
      emailSent = !delivery.queued;
    } catch (emailError) {
      await logIncident(
        'appointment-reschedule-email',
        'warning',
        emailError.message,
        `Rescheduling for booking ${appointment.bookingId} was saved but email delivery failed`
      );
    }

    flash(
      req,
      emailSent || inAppNotified ? 'success' : 'warning',
      emailSent
        ? 'Appointment rescheduled successfully. An email notification was sent.'
        : emailQueued
          ? 'Appointment rescheduled. The email is queued and will be sent when self-healing is turned on.'
        : inAppNotified
          ? 'Appointment rescheduled. An in-app notification was saved, but the email could not be sent.'
          : 'Appointment rescheduled, but email and in-app notifications could not be delivered.',
      'Your appointment is Reschedule'
    );
  } catch (error) {
    await logIncident(
      'appointment-reschedule',
      'error',
      error.message,
      'Rescheduling failed safely'
    );
    flash(req, 'error', 'Could not reschedule this appointment right now.');
  }

  return res.redirect('/appointments');
});

app.post('/appointments/:id/cancel', requirePatient, async (req, res) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      patientId: req.session.user.id
    });

    if (!appointment) {
      flash(req, 'error', 'Appointment not found.');
      return res.redirect('/appointments');
    }

    if (appointment.status === 'cancelled') {
      flash(req, 'warning', 'This appointment is already cancelled.');
      return res.redirect('/appointments');
    }

    appointment.status = 'cancelled';
    await appointment.save();

    try {
      await createNotification({
        userId: req.session.user.id,
        type: 'appointment',
        message: 'Your appointment has been cancelled.'
      });
    } catch (notificationError) {
      await logIncident(
        'appointment-cancel-notification',
        'warning',
        notificationError.message,
        'Cancellation saved, but notification failed'
      );
    }

    const next = await WaitingList.findOne({
      doctorId: appointment.doctorId,
      status: 'waiting'
    }).sort({ createdAt: 1 });

    if (next) {
      next.status = 'offered';
      next.offeredAppointmentDate = appointment.appointmentDate;
      await next.save();

      await createNotification({
        userId: next.patientId,
        type: 'slot-offer',
        message: `A slot may be available on ${appointment.appointmentDate.toLocaleString()}. Please contact the clinic to confirm.`
      });

      await logIncident(
        'waitlist-slot-offer',
        'info',
        'Freed slot offered to waiting-list patient',
        'Staff confirmation required before final booking'
      );
    }

    flash(req, 'success', 'Appointment cancelled successfully.');
  } catch (error) {
    await logIncident(
      'appointment-cancel',
      'error',
      error.message,
      'Cancellation failed safely'
    );

    flash(req, 'error', 'Could not cancel this appointment right now.');
  }

  res.redirect('/appointments');
});

// -------------------- WAITING LIST & QUEUE --------------------

app.post('/waiting-list', requirePatient, async (req, res) => {
  try {
    const { doctorId, preferredDate, reason } = req.body;

    if (!doctorId || !mongoose.isValidObjectId(doctorId)) {
      flash(req, 'error', 'Please select a valid doctor.');
      return res.redirect('/appointments/new');
    }

    const doctor = await Doctor.findOne({
      _id: doctorId,
      active: true
    });

    if (!doctor) {
      flash(req, 'error', 'Selected doctor is not available.');
      return res.redirect('/appointments/new');
    }

    await WaitingList.create({
      patientId: req.session.user.id,
      doctorId,
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      reason: reason || 'Flexible appointment',
      status: 'waiting'
    });

    flash(req, 'success', 'You have been added to the waiting list.');
  } catch (error) {
    await logIncident(
      'waiting-list-add',
      'error',
      error.message,
      'Waiting-list request failed safely'
    );

    flash(req, 'error', 'Could not join the waiting list right now.');
  }

  res.redirect('/dashboard');
});

app.get('/queue', requirePatient, async (req, res) => {
  let position = null;

  try {
    const waiting = await WaitingList.find({
      status: 'waiting'
    })
      .sort({ createdAt: 1 })
      .select('patientId createdAt');

    const index = waiting.findIndex(
      item => String(item.patientId) === req.session.user.id
    );

    position = index === -1 ? null : index + 1;
  } catch (error) {
    await logIncident(
      'queue-position',
      'warning',
      error.message,
      'Queue estimate unavailable'
    );
  }

  res.render('queue', {
    title: 'Queue and Waiting List',
    position
  });
});

function startSelfHealingRun(req, scenarioName) {
  const runId = req.sessionID;
  const existingRun = activeSelfHealingRuns.get(runId);

  if (existingRun?.running) return false;

  const run = {
    running: true,
    currentScenario: null,
    currentStartedAt: null,
    logs: [],
    completedAt: null,
    error: null
  };
  activeSelfHealingRuns.set(runId, run);

  const options = {
    baseUrl: `http://127.0.0.1:${PORT}`,
    browserOnline: req.body.browserOnline === 'true',
    selfHealingEnabled: getHealth().enabled,
    isSelfHealingEnabled: () => getHealth().enabled,
    onProgress(entry) {
      if (entry.phase === 'detect') {
        run.currentScenario = entry.scenario;
        run.currentStartedAt = entry.timestamp;
      }
      run.logs.unshift(entry);
      run.logs = run.logs.slice(0, 100);
    }
  };

  const task = scenarioName
    ? runSelfHealingScenario(scenarioName, options)
    : runSelfHealingScenarios(options);

  task.catch(error => {
    console.error('Self-healing scenario runner failed:', error.message);
    run.error = 'Scenario runner failed. Check the server log for details.';
    run.logs.unshift({
      timestamp: new Date().toISOString(),
      scenario: scenarioName || 'scenario-suite',
      status: 'failed',
      phase: 'complete',
      message: run.error
    });
  }).finally(() => {
    run.running = false;
    run.completedAt = new Date().toISOString();
  });

  return true;
}

// -------------------- SELF-HEALING MONITOR --------------------

app.get('/self-healing/login', (req, res) => {
  if (req.session.selfHealingAdmin) {
    return res.redirect('/self-healing');
  }

  res.render('self-healing-login', {
    title: 'Self-Healing Admin Login',
    csrfToken: ensureSelfHealingCsrfToken(req),
    error: null
  });
});

app.post('/self-healing/login', (req, res, next) => {
  const username = process.env.SELF_HEALING_ADMIN_USERNAME;
  const password = process.env.SELF_HEALING_ADMIN_PASSWORD;

  if (!validSelfHealingCsrfToken(req)) {
    return res.status(403).render('self-healing-login', {
      title: 'Self-Healing Admin Login',
      csrfToken: ensureSelfHealingCsrfToken(req),
      error: 'Your login session expired. Please try again.'
    });
  }

  if (!username || !password) {
    return res.status(503).render('self-healing-login', {
      title: 'Self-Healing Admin Login',
      csrfToken: ensureSelfHealingCsrfToken(req),
      error: 'Admin credentials are not configured. Set SELF_HEALING_ADMIN_USERNAME and SELF_HEALING_ADMIN_PASSWORD in .env.'
    });
  }

  const submittedUsername = String(req.body.username || '');
  const submittedPassword = String(req.body.password || '');

  if (
    !safeCredentialMatch(submittedUsername, username) ||
    !safeCredentialMatch(submittedPassword, password)
  ) {
    return res.status(401).render('self-healing-login', {
      title: 'Self-Healing Admin Login',
      csrfToken: ensureSelfHealingCsrfToken(req),
      error: 'Username or password is incorrect.'
    });
  }

  req.session.regenerate(error => {
    if (error) return next(error);

    req.session.selfHealingAdmin = true;
    req.session.selfHealingCsrfToken = crypto.randomBytes(32).toString('hex');
    req.session.save(saveError => {
      if (saveError) return next(saveError);
      res.redirect('/self-healing');
    });
  });
});

app.post('/self-healing/logout', requireSelfHealingAdmin, (req, res, next) => {
  if (!validSelfHealingCsrfToken(req)) {
    return res.status(403).send('Invalid security token.');
  }

  req.session.destroy(error => {
    if (error) return next(error);
    res.redirect('/self-healing/login');
  });
});

app.post('/self-healing/toggle', requireSelfHealingAdmin, async (req, res) => {
  if (!validSelfHealingCsrfToken(req)) {
    return selfHealingRequestError(req, res, 403, 'Invalid security token.');
  }

  if (req.body.enabled !== 'true' && req.body.enabled !== 'false') {
    return selfHealingRequestError(req, res, 400, 'Choose whether self-healing should be on or off.');
  }

  const enabled = req.body.enabled === 'true';
  await setSelfHealingEnabled(enabled);
  if (enabled) {
    if (recoverChaos()) {
      await logIncident(
        'chaos-recovery',
        'info',
        'Self-healing recovered the simulated service outage',
        'All application routes are available again'
      );
    }
    void connectDatabaseWithRetry();
  }
  let message = `Self-healing is now ${enabled ? 'ON' : 'OFF'}.`;
  let type = 'success';
  if (enabled) {
    try {
      const sentCount = await flushQueuedAppointmentEmails();
      if (sentCount) {
        message += ` Sent ${sentCount} queued appointment email${sentCount === 1 ? '' : 's'}.`;
      }
    } catch (error) {
      type = 'warning';
      message += ' Pending emails could not all be sent; they remain queued for another attempt.';
      await logIncident(
        'pending-appointment-email-delivery',
        'warning',
        error.message,
        'Queued email remains stored and can be retried when self-healing is enabled'
      );
    }
  }
  flash(req, type, message);
  res.redirect('/self-healing');
});

app.post('/self-healing/chaos/:scenario', requireSelfHealingAdmin, async (req, res) => {
  if (!validSelfHealingCsrfToken(req)) {
    return selfHealingRequestError(req, res, 403, 'Invalid security token.');
  }

  if (!selfHealingScenarioNames.includes(req.params.scenario)) {
    return selfHealingRequestError(req, res, 404, 'Unknown self-healing scenario.');
  }

  try {
    triggerChaos(req.params.scenario);
  } catch (error) {
    return selfHealingRequestError(req, res, 409, error.message);
  }

  await logIncident(
    'chaos-injection',
    'warning',
    `Simulated service outage injected from ${req.params.scenario}`,
    getHealth().enabled
      ? 'Automatic self-healing recovery is scheduled'
      : 'Recovery is paused until self-healing is enabled'
  );
  flash(
    req,
    'warning',
    getHealth().enabled
      ? 'Chaos simulation started. Services will recover automatically in a few seconds.'
      : 'Chaos simulation started. Services are paused until you turn self-healing on.'
  );
  return res.redirect('/self-healing');
});

function selfHealingDatabaseUnavailable(req, res, scenarioName) {
  const databaseDependentScenarios = [
    'database-reconnect',
    'booking-idempotency',
    'notification-delivery',
    'appointment-reconciliation'
  ];
  if (
    getHealth().enabled &&
    mongoose.connection.readyState !== 1 &&
    (!scenarioName || databaseDependentScenarios.includes(scenarioName))
  ) {
    selfHealingRequestError(
      req,
      res,
      503,
      'The database is currently unavailable. Restore database connectivity before running this self-healing scenario.'
    );
    return true;
  }
  return false;
}

app.post('/self-healing/run', requireSelfHealingAdmin, async (req, res) => {
  if (!validSelfHealingCsrfToken(req)) {
    return selfHealingRequestError(req, res, 403, 'Invalid security token.');
  }

  if (selfHealingDatabaseUnavailable(req, res, null)) return;

  if (!startSelfHealingRun(req, null)) {
    return res.status(409).json({ message: 'A scenario run is already in progress.' });
  }
  res.status(202).json({ started: true });
});

app.post('/self-healing/run/:scenario', requireSelfHealingAdmin, async (req, res) => {
  if (!validSelfHealingCsrfToken(req)) {
    return selfHealingRequestError(req, res, 403, 'Invalid security token.');
  }

  if (!selfHealingScenarioNames.includes(req.params.scenario)) {
    return selfHealingRequestError(req, res, 404, 'Unknown self-healing scenario.');
  }

  if (selfHealingDatabaseUnavailable(req, res, req.params.scenario)) return;

  if (!startSelfHealingRun(req, req.params.scenario)) {
    return res.status(409).json({ message: 'A scenario run is already in progress.' });
  }
  res.status(202).json({ started: true });
});

app.get('/self-healing/run-status', requireSelfHealingAdmin, (req, res) => {
  const run = activeSelfHealingRuns.get(req.sessionID);
  if (!run) {
    return res.json({
      running: false,
      logs: [],
      completedAt: null
    });
  }

  res.json({
    running: run.running,
    currentScenario: run.currentScenario,
    currentStartedAt: run.currentStartedAt,
    logs: run.logs,
    completedAt: run.completedAt,
    error: run.error
  });
});

app.get('/self-healing', requireSelfHealingAdmin, async (req, res) => {
  let incidents = [];
  let scenarioLogs = [];
  const databaseUnavailable = mongoose.connection.readyState !== 1;

  try {
    [incidents, scenarioLogs] = await Promise.all([
      databaseUnavailable
        ? Promise.resolve([])
        : Incident.find().sort({ createdAt: -1 }).limit(20).lean(),
      readRecentLogs()
    ]);
  } catch (error) {
    console.error('Could not read self-healing history:', error.message);
    return res.status(500).render('500', {
      title: 'Self-Healing History Unavailable'
    });
  }

  const latestScenarioStatuses = {};
  for (const entry of scenarioLogs) {
    if (!latestScenarioStatuses[entry.scenario]) {
      latestScenarioStatuses[entry.scenario] = entry;
    }
  }

  res.render('self-healing', {
    title: 'Self-Healing Monitor',
    health: getHealth(),
    incidents,
    scenarioLogs,
    latestScenarioStatuses,
    csrfToken: ensureSelfHealingCsrfToken(req),
    databaseUnavailable
  });
});

// -------------------- ADMIN --------------------

app.get('/admin', requireAdmin, async (req, res) => {
  let users = 0;
  let appointments = 0;
  let waiting = 0;
  let incidents = [];

  try {
    [users, appointments, waiting] = await Promise.all([
      User.countDocuments(),
      Appointment.countDocuments(),
      WaitingList.countDocuments({ status: 'waiting' })
    ]);

    incidents = await Incident.find()
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();
  } catch (error) {
    await logIncident(
      'admin-dashboard',
      'warning',
      error.message,
      'Admin metrics partially unavailable'
    );
  }

  res.render('admin', {
    title: 'Admin Monitoring',
    stats: { users, appointments, waiting },
    health: getHealth(),
    incidents
  });
});

app.post('/admin/seed-doctors', requireAdmin, async (req, res) => {
  try {
    const defaults = [
      {
        name: 'Dr. Aditi Sharma',
        specialty: 'General Medicine',
        experience: 12,
        availability: 'Monâ€“Fri, 9 AMâ€“1 PM'
      },
      {
        name: 'Dr. Rohan Mehta',
        specialty: 'Cardiology',
        experience: 10,
        availability: 'Monâ€“Sat, 10 AMâ€“2 PM'
      },
      {
        name: 'Dr. Sana Khan',
        specialty: 'Orthopaedics',
        experience: 8,
        availability: 'Tueâ€“Sat, 11 AMâ€“3 PM'
      },
      {
        name: 'Dr. Vivek Joshi',
        specialty: 'Paediatrics',
        experience: 9,
        availability: 'Monâ€“Fri, 4 PMâ€“7 PM'
      },
      {
        name: 'Dr. Nisha Verma',
        specialty: 'Dermatology',
        experience: 7,
        availability: 'Wedâ€“Sun, 10 AMâ€“1 PM'
      },
      {
        name: 'Dr. Arjun Singh',
        specialty: 'Neurology',
        experience: 14,
        availability: 'Mon, Wed, Fri, 2 PMâ€“5 PM'
      }
    ];

    for (const doctor of defaults) {
      await Doctor.updateOne(
        { name: doctor.name },
        { $setOnInsert: doctor },
        { upsert: true }
      );
    }

    flash(req, 'success', 'Demo doctor list is ready.');
  } catch (error) {
    await logIncident(
      'seed-doctors',
      'error',
      error.message,
      'Doctor seed operation failed'
    );

    flash(req, 'error', 'Could not seed doctors.');
  }

  res.redirect('/admin');
});

app.post('/admin/resolve/:id', requireAdmin, async (req, res) => {
  try {
    await Incident.updateOne(
      { _id: req.params.id },
      { $set: { resolved: true, resolvedAt: new Date() } }
    );

    flash(req, 'success', 'Incident marked as reviewed.');
  } catch (error) {
    await logIncident(
      'incident-resolve',
      'error',
      error.message,
      'Incident status could not be updated'
    );

    flash(req, 'error', 'Could not update incident.');
  }

  res.redirect('/admin');
});

// -------------------- HEALTH CHECK --------------------

app.get('/health', (req, res) => {
  const health = getHealth();
  const databaseConnected = health.database === 'connected';
  const healthy = databaseConnected && !health.chaosActive;

  res.status(healthy ? 200 : 503).json({
    service: 'hospital-api',
    status: healthy ? 'healthy' : 'degraded',
    database: databaseConnected ? 'connected' : 'disconnected',
    chaosSimulation: health.chaosActive,
    message: health.chaosActive
      ? 'The app is in a simulated service outage.'
      : databaseConnected
      ? 'Database connection is available.'
      : 'The database is currently unavailable. Please try again when connectivity is restored.',
    timestamp: new Date().toISOString()
  });
});

// -------------------- ERROR HANDLING --------------------

app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found'
  });
});

app.use(async (error, req, res, next) => {
  try {
    await logIncident(
      'express-unhandled-error',
      'error',
      error.message,
      'Request handled by safe error page'
    );
  } catch (logError) {
    console.error('Could not log incident:', logError.message);
  }

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).render('500', {
    title: 'Temporary Issue'
  });
});

// -------------------- START SERVER --------------------

function connectDatabaseWithRetry() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (databaseReconnectTask) return databaseReconnectTask;

  databaseReconnectTask = (async () => {
    let initialAttempt = true;
    while (
      mongoose.connection.readyState !== 1 &&
      (initialAttempt || getHealth().enabled)
    ) {
      initialAttempt = false;
      try {
        await mongoose.connect(
          process.env.MONGODB_URI ||
          'mongodb://127.0.0.1:27017/carenest_hospital',
          { serverSelectionTimeoutMS: 5000 }
        );
        console.log('MongoDB connected');
        await logIncident(
          'database-reconnected',
          'info',
          'CareNest is connected to MongoDB',
          'Database connection is available'
        );
        return;
      } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        if (!getHealth().enabled) return;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  })().finally(() => {
    databaseReconnectTask = null;
  });

  return databaseReconnectTask;
}

async function start() {
  await loadSelfHealingSetting();

  mongoose.connection.on('connected', () => {
    console.log('MongoDB connected/reconnected');
  });

  mongoose.connection.on('disconnected', () => {
    console.error('MongoDB disconnected');

    logIncident(
      'mongodb-disconnect',
      'error',
      'MongoDB connection lost',
      'Mongoose connection manager will attempt reconnection'
    ).catch(console.error);
  });

  mongoose.connection.on('error', error => {
    logIncident(
      'mongodb-error',
      'error',
      error.message,
      'Connection retry handled by Mongoose'
    ).catch(console.error);
  });

  startHealthMonitor();

  app.listen(PORT, () => {
    console.log(`CareNest running at http://localhost:${PORT}`);
  });

  if (getHealth().enabled) {
    void flushQueuedAppointmentEmails().catch(error => {
      console.error('Could not flush queued appointment emails:', error.message);
      void logIncident(
        'pending-appointment-email-delivery',
        'warning',
        error.message,
        'Queued emails remain stored and will be retried the next time self-healing is enabled'
      );
    });
  }

  setInterval(() => {
    if (
      getHealth().enabled &&
      mongoose.connection.readyState === 0
    ) {
      void connectDatabaseWithRetry();
    }
  }, 5000).unref();

  void connectDatabaseWithRetry();
}

start();
