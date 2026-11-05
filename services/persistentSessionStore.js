const session = require('express-session');
const fs = require('fs/promises');
const path = require('path');

class PersistentSessionStore extends session.Store {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this.operationQueue = Promise.resolve();
  }

  runExclusive(operation, callback) {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.catch(() => {});
    result.then(value => callback(null, value), callback);
  }

  async readSessions() {
    try {
      const sessions = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      if (!sessions || Array.isArray(sessions) || typeof sessions !== 'object') {
        throw new Error('Persistent session store must contain a JSON object.');
      }
      return sessions;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async writeSessions(sessions) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(sessions)}\n`, 'utf8');
    await fs.rename(temporaryPath, this.filePath);
  }

  get(sessionId, callback) {
    this.runExclusive(async () => {
      const sessions = await this.readSessions();
      const stored = sessions[sessionId];
      if (!stored) return null;

      if (stored.expiresAt <= Date.now()) {
        delete sessions[sessionId];
        await this.writeSessions(sessions);
        return null;
      }

      return stored.session;
    }, callback);
  }

  set(sessionId, sessionData, callback) {
    this.runExclusive(async () => {
      const sessions = await this.readSessions();
      for (const [storedSessionId, stored] of Object.entries(sessions)) {
        if (stored.expiresAt <= Date.now()) delete sessions[storedSessionId];
      }
      const cookieExpiry = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + (sessionData.cookie?.maxAge || 8 * 60 * 60 * 1000);
      sessions[sessionId] = {
        expiresAt: cookieExpiry,
        session: sessionData
      };
      await this.writeSessions(sessions);
    }, callback);
  }

  touch(sessionId, sessionData, callback) {
    this.set(sessionId, sessionData, callback);
  }

  destroy(sessionId, callback) {
    this.runExclusive(async () => {
      const sessions = await this.readSessions();
      delete sessions[sessionId];
      await this.writeSessions(sessions);
    }, callback);
  }
}

module.exports = PersistentSessionStore;
