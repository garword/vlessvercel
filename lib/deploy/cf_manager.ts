
import { createClient } from "@libsql/client";

// Types
export interface CFAccount {
    id: number;
    owner_id: string | null; // null for admin
    email: string;
    api_token: string;
    account_id: string;
    zone_id: string;
    worker_domain: string;
    status: 'active' | 'limited' | 'dead';
    last_used: number;
}

export class CFAccountManager {
    private db;

    constructor() {
        const url = process.env.TURSO_DATABASE_URL!;
        const authToken = process.env.TURSO_AUTH_TOKEN!;
        this.db = createClient({ url, authToken });
    }

    // --- User Management ---
    async upsertUser(telegramId: string, username: string, name: string) {
        await this.db.execute({
            sql: `INSERT INTO users (telegram_id, username, first_name, joined_at)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name`,
            args: [telegramId, username, name, Date.now()]
        });
    }

    // --- Account Management ---

    async addAccount(ownerId: string | null, email: string, token: string, accountId: string, zoneId: string, domain: string) {
        await this.db.execute({
            sql: `INSERT INTO cf_accounts (owner_id, email, api_token, account_id, zone_id, worker_domain, status, last_used)
                  VALUES (?, ?, ?, ?, ?, ?, 'active', 0)`,
            args: [ownerId, email, token, accountId, zoneId, domain]
        });
    }

    async getAccounts(ownerId: string | null): Promise<CFAccount[]> {
        const sql = ownerId
            ? "SELECT * FROM cf_accounts WHERE owner_id = ?"
            : "SELECT * FROM cf_accounts WHERE owner_id IS NULL"; // Admin

        const res = await this.db.execute({ sql, args: ownerId ? [ownerId] : [] });
        return res.rows.map(row => row as unknown as CFAccount);
    }

    async deleteAccount(id: number, ownerId: string | null) {
        // Security: Ensure owner matches (or is admin managing specifically system accounts)
        const sql = ownerId
            ? "DELETE FROM cf_accounts WHERE id = ? AND owner_id = ?"
            : "DELETE FROM cf_accounts WHERE id = ? AND owner_id IS NULL";

        await this.db.execute({ sql, args: ownerId ? [id, ownerId] : [id] });
    }

    // --- Rotation Logic ---

    /**
     * Get the best available account for deployment.
     * Logic: Active > Least Used > Random Fallback
     */
    async getBestAccount(ownerId: string | null): Promise<CFAccount | null> {
        const sql = ownerId
            ? "SELECT * FROM cf_accounts WHERE owner_id = ? AND status = 'active' ORDER BY last_used ASC LIMIT 1"
            : "SELECT * FROM cf_accounts WHERE owner_id IS NULL AND status = 'active' ORDER BY last_used ASC LIMIT 1";

        const res = await this.db.execute({ sql, args: ownerId ? [ownerId] : [] });
        if (res.rows.length === 0) return null;
        return res.rows[0] as unknown as CFAccount;
    }

    /**
     * Mark an account as 'limited' if deployment fails with 10xxx error.
     */
    async markLimited(id: number) {
        await this.db.execute({
            sql: "UPDATE cf_accounts SET status = 'limited', last_used = ? WHERE id = ?",
            args: [Date.now(), id]
        });
    }

    /**
     * Mark an account as 'used', updating timestamp
     */
    async markUsed(id: number) {
        await this.db.execute({
            sql: "UPDATE cf_accounts SET last_used = ? WHERE id = ?",
            args: [Date.now(), id]
        });
    }

    // --- Wildcard Management ---

    async addWildcard(domain: string, addedBy: string) {
        await this.db.execute({
            sql: "INSERT OR IGNORE INTO wildcards (domain, added_by, created_at) VALUES (?, ?, ?)",
            args: [domain, addedBy, Date.now()]
        });
    }

    async getWildcards(): Promise<string[]> {
        const res = await this.db.execute("SELECT domain FROM wildcards");
        return res.rows.map(r => r.domain as string);
    }
}
