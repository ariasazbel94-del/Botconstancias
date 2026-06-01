const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');

class Database {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH);
        this.init();
    }

    init() {
        this.db.serialize(() => {
            this.db.run(`CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                credits INTEGER DEFAULT 0,
                total_generated INTEGER DEFAULT 0,
                registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            this.db.run(`CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                type TEXT,
                amount INTEGER,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            this.db.run(`CREATE TABLE IF NOT EXISTS constancias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                rfc TEXT,
                idcif TEXT,
                status TEXT,
                file_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Admin por defecto
            this.db.run(`INSERT OR IGNORE INTO users (user_id, credits) VALUES ('525658261168', 9999)`);
        });
    }

    async addUser(userId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR IGNORE INTO users (user_id) VALUES (?)',
                [userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async addCredits(userId, amount, description = 'Recarga') {
        await this.addUser(userId);
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE users SET credits = credits + ? WHERE user_id = ?',
                [amount, userId],
                (err) => {
                    if (err) reject(err);
                    else {
                        this.logTransaction(userId, 'add', amount, description);
                        resolve();
                    }
                }
            );
        });
    }

    async deductCredit(userId) {
        const user = await this.getUser(userId);
        if (!user || user.credits <= 0) return false;
        
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE users SET credits = credits - 1, total_generated = total_generated + 1, last_activity = CURRENT_TIMESTAMP WHERE user_id = ?',
                [userId],
                (err) => {
                    if (err) reject(err);
                    else {
                        this.logTransaction(userId, 'deduct', 1, 'Generación de constancia');
                        resolve(true);
                    }
                }
            );
        });
    }

    async logTransaction(userId, type, amount, description) {
        this.db.run(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [userId, type, amount, description]
        );
    }

    async getCredits(userId) {
        const user = await this.getUser(userId);
        return user ? user.credits : 0;
    }

    async getStats(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT credits, total_generated FROM users WHERE user_id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || { credits: 0, total_generated: 0 });
                }
            );
        });
    }

    async getUser(userId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    }

    async getAllUsers() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM users ORDER BY registered_at DESC', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async addConstancia(userId, rfc, idcif, status, filePath) {
        this.db.run(
            'INSERT INTO constancias (user_id, rfc, idcif, status, file_path) VALUES (?, ?, ?, ?, ?)',
            [userId, rfc, idcif, status, filePath]
        );
    }
}

module.exports = Database;
