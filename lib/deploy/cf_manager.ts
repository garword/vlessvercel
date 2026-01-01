
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
    private db: any = null;
    private ready: boolean = false;

    constructor() {
        const url = process.env.TURSO_DATABASE_URL;
        const authToken = process.env.TURSO_AUTH_TOKEN;

        if (url && authToken) {
            try {
                this.db = createClient({ url, authToken });
                this.ready = true;
            } catch (e) {
                console.error("CFAccountManager DB Init Failed:", e);
            }
        } else {
            console.warn("⚠️ TURSO credentials missing in Vercel Env.");
        }
    }

    // --- User Management ---
    async upsertUser(telegramId: string, username: string, name: string) {
        if (!this.ready) return;
        try {
            await this.db.execute({
                sql: `INSERT INTO users (telegram_id, username, first_name, joined_at)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name`,
                args: [telegramId, username, name, Date.now()]
            });
        } catch (e) {
            console.error("upsertUser failed:", e);
        }
    }

    // --- Account Management ---

    async addAccount(ownerId: string | null, email: string, token: string, accountId: string, zoneId: string, domain: string) {
        if (!this.ready) throw new Error("Database not connected");
        await this.db.execute({
            sql: `INSERT INTO cf_accounts (owner_id, email, api_token, account_id, zone_id, worker_domain, status, last_used)
                  VALUES (?, ?, ?, ?, ?, ?, 'active', 0)`,
            args: [ownerId, email, token, accountId, zoneId, domain]
        });
    }

    async getAccounts(ownerId: string | null): Promise<CFAccount[]> {
        if (!this.ready) return [];
        try {
            const sql = ownerId
                ? "SELECT * FROM cf_accounts WHERE owner_id = ?"
                : "SELECT * FROM cf_accounts WHERE owner_id IS NULL"; // Admin

            const res = await this.db.execute({ sql, args: ownerId ? [ownerId] : [] });
            return res.rows.map((row: any) => row as unknown as CFAccount);
        } catch (e) { return []; }
    }

    async removeAccount(id: number, ownerId: string | null) {
        if (!this.ready) return;

        // Security: Ensure owner matches (or is admin managing specifically system accounts)
        // Note: ownerId is passed as string from Telegram Context.  

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
        if (!this.ready) return null;
        try {
            const sql = ownerId
                ? "SELECT * FROM cf_accounts WHERE owner_id = ? AND status = 'active' ORDER BY last_used ASC LIMIT 1"
                : "SELECT * FROM cf_accounts WHERE owner_id IS NULL AND status = 'active' ORDER BY last_used ASC LIMIT 1";

            const res = await this.db.execute({ sql, args: ownerId ? [ownerId] : [] });
            if (res.rows.length === 0) return null;
            return res.rows[0] as unknown as CFAccount;
        } catch (e) { return null; }
    }

    /**
     * Mark an account as 'limited' if deployment fails with 10xxx error.
     */
    async markLimited(id: number) {
        if (!this.ready) return;
        await this.db.execute({
            sql: "UPDATE cf_accounts SET status = 'limited', last_used = ? WHERE id = ?",
            args: [Date.now(), id]
        });
    }

    /**
     * Mark an account as 'used', updating timestamp
     */
    async markUsed(id: number) {
        if (!this.ready) return;
        await this.db.execute({
            sql: "UPDATE cf_accounts SET last_used = ? WHERE id = ?",
            args: [Date.now(), id]
        });
    }

    // --- Wildcard Management ---

    async addWildcard(domain: string, addedBy: string) {
        if (!this.ready) return;
        await this.db.execute({
            sql: "INSERT OR IGNORE INTO wildcards (domain, added_by, created_at) VALUES (?, ?, ?)",
            args: [domain, addedBy, Date.now()]
        });
    }

    async getWildcards(): Promise<string[]> {
        if (!this.ready) return [];
        try {
            const res = await this.db.execute("SELECT domain FROM wildcards");
            return res.rows.map((r: any) => r.domain as string);
        } catch (e) { return []; }
    }
}
