
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

const User = require('../models/User');
const Doctor = require('../models/Doctor');

const rl = readline.createInterface({ input: stdin, output: stdout });

async function main() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('\n=== CareNest Doctor Account Setup ===\n');

        const doctors = await Doctor.find({ active: true })
            .select('_id name specialty userId')
            .sort({ name: 1 })
            .lean();

        if (!doctors.length) {
            console.log('No active doctor profiles found.');
            return;
        }

        console.log('Available doctor profiles:');
        doctors.forEach((doctor, index) => {
            console.log(
                `${index + 1}. ${doctor.name} - ${doctor.specialty}` +
                `${doctor.userId ? ' [ALREADY LINKED]' : ''}`
            );
        });

        const choice = Number(await rl.question('\nEnter doctor number: '));

        if (!Number.isInteger(choice) || choice < 1 || choice > doctors.length) {
            console.log('Invalid doctor number.');
            return;
        }

        const doctor = doctors[choice - 1];

        if (doctor.userId) {
            console.log('This doctor profile is already linked to a user.');
            return;
        }

        const fullName = (await rl.question('Doctor full name: ')).trim();
        const email = (await rl.question('Doctor email: ')).trim().toLowerCase();
        const phone = (await rl.question('Phone number: ')).trim();

        if (!fullName || !email || !phone || !email.includes('@')) {
            console.log('Please enter valid name, email and phone.');
            return;
        }

        const existingUser = await User.findOne({ email }).select('_id email');

        if (existingUser) {
            console.log('This email already has an account. No changes made.');
            return;
        }

        const password = await new Promise((resolve, reject) => {
            const stdin = process.stdin;
            const wasRaw = stdin.isRaw;

            stdout.write('Create doctor password (input hidden): ');
            stdin.setRawMode?.(true);
            stdin.resume();

            let value = '';

            const onData = (key) => {
                const char = key.toString();

                if (char === '\u0003') {
                    cleanup();
                    reject(new Error('Password entry cancelled.'));
                } else if (char === '\r' || char === '\n') {
                    cleanup();
                    stdout.write('\n');
                    resolve(value);
                } else if (char === '\u007f' || char === '\b') {
                    value = value.slice(0, -1);
                } else {
                    value += char;
                }
            };

            function cleanup() {
                stdin.removeListener('data', onData);
                if (wasRaw !== undefined) stdin.setRawMode(wasRaw);
                stdin.pause();
            }

            stdin.on('data', onData);
        });

        if (password.length < 8) {
            console.log('Password must contain at least 8 characters.');
            return;
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await User.create({
            fullName,
            email,
            phone,
            passwordHash,
            role: 'doctor'
        });

        try {
            doctor.userId = user._id;
            await Doctor.updateOne(
                { _id: doctor._id, userId: { $exists: false } },
                { $set: { userId: user._id } }
            );

            const linkedDoctor = await Doctor.findOne({
                _id: doctor._id,
                userId: user._id
            });

            if (!linkedDoctor) {
                await User.deleteOne({ _id: user._id });
                throw new Error('Could not link doctor profile. User account rolled back.');
            }
        } catch (error) {
            await User.deleteOne({ _id: user._id });
            throw error;
        }

        console.log('\nDoctor account created and linked successfully.');
        console.log('Doctor:', doctor.name);
        console.log('Login email:', email);
        console.log('Login page: use your existing CareNest login page.');
        console.log('After login, the doctor should open /doctor/dashboard.');
    } finally {
        rl.close();
        await mongoose.disconnect().catch(() => {});
    }
}

main().catch(error => {
    console.error('\nSetup failed:', error.message);
    process.exitCode = 1;
});
