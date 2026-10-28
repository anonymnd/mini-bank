import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BankApi, History, message } from './api';
import { Icon, MadPipe } from './shared';

@Component({
    selector: 'app-accounts',
    imports: [DatePipe, ReactiveFormsModule, Icon, MadPipe],
    template: `
        <div class="page-heading">
            <div>
                <p class="eyebrow">CUSTOMER ACCOUNTS</p>
                <h1>Every account. One place.</h1>
                <p class="subtitle">Find customers and follow their ledger movements.</p>
            </div>
            <span class="pill">MAD accounts</span>
        </div>
        <section class="panel">
            <div class="panel-heading">
                <h2>Account directory</h2>
                <label class="search"
                    ><app-icon name="search" /><span class="sr-only">Search accounts</span
                    ><input [formControl]="search" placeholder="Search name or account…"
                /></label>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Account ID</th>
                            <th class="right">Balance · MAD</th>
                            <th><span class="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (account of filtered(); track account.id) {
                            <tr [class.selected-row]="history()?.account?.id === account.id">
                                <td>
                                    <span class="customer-name"
                                        ><span class="avatar">{{ account.name.slice(0, 1) }}</span
                                        ><strong>{{ account.name }}</strong></span
                                    >
                                </td>
                                <td class="mono">{{ account.id }}</td>
                                <td class="right amount">{{ account.balance_cents | mad }}</td>
                                <td class="right">
                                    <button
                                        class="button small secondary"
                                        (click)="open(account.id)"
                                    >
                                        View history <app-icon name="arrow" />
                                    </button>
                                </td>
                            </tr>
                        } @empty {
                            <tr>
                                <td colspan="4" class="empty">No accounts match your search.</td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        </section>
        @if (loading()) {
            <p role="status" class="notice">Loading account history…</p>
        }
        @if (error()) {
            <p role="alert" class="notice error">{{ error() }}</p>
        }
        @if (history(); as detail) {
            <section class="panel detail-panel">
                <div class="panel-heading">
                    <div>
                        <p class="eyebrow">ACCOUNT LEDGER</p>
                        <h2>{{ detail.account.name }}</h2>
                        <p class="mono">{{ detail.account.id }} · Latest 200 entries</p>
                    </div>
                    <div class="detail-balance">
                        <small>Current balance · MAD</small
                        ><strong>{{ detail.account.balance_cents | mad }}</strong>
                    </div>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Reference</th>
                                <th>Date · UTC</th>
                                <th>Type</th>
                                <th class="right">Movement · MAD</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (entry of detail.entries; track entry.reference) {
                                <tr>
                                    <td class="mono">{{ entry.reference }}</td>
                                    <td>
                                        {{
                                            entry.created_at | date: 'dd MMM yyyy, HH:mm:ss' : 'UTC'
                                        }}
                                    </td>
                                    <td>
                                        {{
                                            entry.reversal_of
                                                ? 'Reversal of ' + entry.reversal_of
                                                : entry.signed_cents < 0
                                                  ? 'Debit'
                                                  : 'Credit'
                                        }}
                                    </td>
                                    <td
                                        class="right amount"
                                        [class.credit]="entry.signed_cents > 0"
                                    >
                                        {{ entry.signed_cents > 0 ? '+' : ''
                                        }}{{ entry.signed_cents | mad }}
                                    </td>
                                </tr>
                            } @empty {
                                <tr>
                                    <td colspan="4" class="empty">
                                        No ledger movements for this account.
                                    </td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </section>
        }
    `,
})
export class Accounts {
    readonly api = inject(BankApi);
    readonly search = new FormControl('', { nonNullable: true });
    readonly history = signal<History | null>(null);
    readonly loading = signal(false);
    readonly error = signal('');
    private revision = 0;

    constructor() {
        const account = inject(ActivatedRoute).snapshot.queryParamMap.get('account');
        if (account) void this.open(account);
    }
    filtered() {
        const query = this.search.value.toLowerCase();
        return (
            this.api
                .state()
                ?.accounts.filter((account) =>
                    (account.name + account.id).toLowerCase().includes(query),
                ) ?? []
        );
    }
    async open(account: string) {
        const revision = ++this.revision;
        this.loading.set(true);
        this.error.set('');
        this.history.set(null);
        try {
            const result = await this.api.request<History>(
                '/accounts/' + encodeURIComponent(account),
            );
            if (revision === this.revision) this.history.set(result);
        } catch (error) {
            if (revision === this.revision) this.error.set(message(error));
        } finally {
            if (revision === this.revision) this.loading.set(false);
        }
    }
}
