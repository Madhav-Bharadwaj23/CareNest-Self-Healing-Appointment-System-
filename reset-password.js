
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
const User = require('./models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  try {
    const email = (await ask('Registered email: '))
      .trim()
      .toLowerCase();

    const password = await ask('Enter your new password (8+ characters): ');

    if (!/^\S+@\S+\.\S+$/.test(email)) {
  throw new Error('Please enter a valid email address.');
}
    if (password.length < 8) {
      throw new Error('Password must contain at least 8 characters.');
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing from .env.');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const user = await User.findOne({ email }).select('+passwordHash');

    if (!user) {
      throw new Error('No account found for that email in this database.');
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.failedLoginAttempts = 0;
    user.lockUntil = null;

    await user.save();

    console.log('Password updated successfully. You can now sign in.');
  } catch (error) {
    console.error('Password reset failed:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await mongoose.disconnect().catch(() => {});
  }
}

main();
