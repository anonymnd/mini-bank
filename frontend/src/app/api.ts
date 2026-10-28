import { Injectable, signal } from '@angular/core';

export interface Account {
    id: string;
    name: string;
    balance_cents: number;
}
export interface Payment {
    reference: string;
    source: string;
    destination: string;
    cents: number;
    status: 'POSTED' | 'REJECTED';
    reason: string;
    created_at: string;
    reversal_of: string | null;
    reversed_by: string | null;
}
export interface BatchRun {
    id: number;
    status: 'RUNNING' | 'COMPLETED';
    started_at: string;
    finished_at: string | null;
    posted: number;
    retried: number;
    rejected: number;
    file_name: string;
}
export interface Snapshot {
    accounts: Account[];
    payments: Payment[];
    runs: BatchRun[];
    rejects: { run_id: number; line_number: number; reason: string }[];
    summary: { accounts: number; posted: number; rejected: number; total_cents: number };
}
export interface History {
    account: Account;
    entries: {
        reference: string;
        created_at: string;
        reversal_of: string | null;
        signed_cents: number;
    }[];
}
export interface Result {
    ok: boolean;
    output: string;
    code: number;
    file_name?: string;
}

@Injectable({ providedIn: 'root' })
export class BankApi {
    readonly state = signal<Snapshot | null>(null);
    readonly loading = signal(false);
    readonly error = signal('');
    private token: Promise<string> | undefined;
    private revision = 0;

    private session(): Promise<string> {
        this.token ??= fetch('/api/session', { credentials: 'same-origin' })
            .then(async (response) => {
                if (!response.ok)
                    throw new Error('Cannot start a local session. Refresh the page.');
                return ((await response.json()) as { token: string }).token;
            })
            .catch((error: unknown) => {
                this.token = undefined;
                throw error;
            });
        return this.token;
    }

    async request<T>(path: string, body?: object): Promise<T> {
        const token = await this.session();
        const response = await fetch('/api' + path, {
            method: body === undefined ? 'GET' : 'POST',
            credentials: 'same-origin',
            headers: {
                'X-MiniBank-Token': token,
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const data = (await response.json()) as T & { message?: string; output?: string };
        if (!response.ok && !(response.status === 422 && data.output)) {
            throw new Error(
                data.message ??
                    'The service is unavailable. Inspect the result before retrying the same reference.',
            );
        }
        return data;
    }

    async refresh(): Promise<void> {
        const revision = ++this.revision;
        this.loading.set(true);
        this.error.set('');
        try {
            const data = await this.request<Snapshot>('/state');
            if (revision === this.revision) this.state.set(data);
        } catch (error) {
            if (revision === this.revision) this.error.set(message(error));
        } finally {
            if (revision === this.revision) this.loading.set(false);
        }
    }
}

export function message(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'Something went wrong. Inspect results before retrying.';
}
