import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BankApi } from './api';
import { Icon, MadPipe } from './shared';

@Component({
    selector: 'app-overview',
    imports: [DatePipe, RouterLink, Icon, MadPipe],
    template: `
        <div class="page-heading">
            <div>
                <p class="eyebrow">WORKSPACE OVERVIEW</p>
                <h1>Your operations, in view.</h1>
                <p class="subtitle">A clear picture of your accounts and everyday payments.</p>
            </div>
            <a class="button primary" routerLink="/payments"
                ><app-icon name="plus" /> New transfer</a
            >
        </div>
        @if (api.state(); as data) {
            <section class="metrics" aria-label="Workspace totals">
                <article class="metric featured">
                    <div class="metric-label">
                        Total account balances <app-icon name="accounts" />
                    </div>
                    <div class="metric-number">
                        {{ data.summary.total_cents | mad }} <small>MAD</small>
                    </div>
                    <span class="metric-note"
                        >Across {{ data.summary.accounts }} customer accounts</span
                    >
                </article>
                <article class="metric">
                    <div class="metric-label">Posted payments <app-icon name="payments" /></div>
                    <div class="metric-number">{{ data.summary.posted }}</div>
                    <span class="metric-note"
                        ><span class="status-dot"></span> Successfully committed</span
                    >
                </article>
                <article class="metric">
                    <div class="metric-label">Rejected requests <app-icon name="shield" /></div>
                    <div class="metric-number">{{ data.summary.rejected }}</div>
                    <span class="metric-note">No funds moved · all-time requests</span>
                </article>
            </section>
            <div class="overview-grid">
                <section class="panel">
                    <div class="panel-heading">
                        <div>
                            <h2>Account balances</h2>
                            <p>Current funds, by account</p>
                        </div>
                        <span class="currency-label">MAD</span>
                    </div>
                    <div class="balances">
                        @for (account of data.accounts; track account.id; let i = $index) {
                            <a
                                class="balance-item"
                                routerLink="/accounts"
                                [queryParams]="{ account: account.id }"
                                ><div class="balance-top">
                                    <span
                                        ><span
                                            class="account-marker"
                                            [class.alt]="i % 2 === 1"
                                        ></span
                                        >{{ account.name }}</span
                                    ><strong>{{ account.balance_cents | mad }}</strong>
                                </div>
                                <div class="balance-bar">
                                    <span
                                        [style.width.%]="
                                            data.summary.total_cents
                                                ? (account.balance_cents /
                                                      data.summary.total_cents) *
                                                  100
                                                : 0
                                        "
                                    ></span>
                                </div>
                                <div class="mono muted balance-id">{{ account.id }}</div></a
                            >
                        } @empty {
                            <p class="empty">No accounts available.</p>
                        }
                    </div>
                    <a class="panel-footer-link" routerLink="/accounts"
                        >Explore accounts <app-icon name="arrow"
                    /></a>
                </section>
                <section class="action-panel">
                    <span class="action-icon"><app-icon name="shield" /></span>
                    <p class="eyebrow">DAILY FINANCIAL CONTROLS</p>
                    <h2>Confidence in<br />every movement.</h2>
                    <p>
                        Verify balances, paired ledger entries, and payment integrity before closing
                        your work.
                    </p>
                    <a class="button light" routerLink="/controls"
                        >Open reconciliation <app-icon name="arrow"
                    /></a>
                    <div class="action-bottom">
                        <app-icon name="check" /> Exact cents. Traceable payments.
                    </div>
                </section>
            </div>
            <section class="panel">
                <div class="panel-heading">
                    <div>
                        <h2>Recent payment activity</h2>
                        <p>The latest instructions across your workspace</p>
                    </div>
                    <a class="text-link" routerLink="/payments"
                        >View all <app-icon name="arrow"
                    /></a>
                </div>
                <div class="table-wrap">
                    <table>
                        <caption class="sr-only">
                            Latest five payment requests
                        </caption>
                        <thead>
                            <tr>
                                <th>Reference</th>
                                <th>Movement</th>
                                <th>Date · UTC</th>
                                <th class="right">Amount · MAD</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (payment of data.payments.slice(0, 5); track payment.reference) {
                                <tr>
                                    <td>
                                        <strong class="mono">{{ payment.reference }}</strong
                                        ><span class="cell-detail">{{
                                            payment.reversal_of ? 'Reversal' : 'Internal transfer'
                                        }}</span>
                                    </td>
                                    <td class="mono movement">
                                        {{ payment.source }} <span>→</span>
                                        {{ payment.destination }}
                                    </td>
                                    <td>
                                        {{ payment.created_at | date: 'dd MMM, HH:mm' : 'UTC' }}
                                    </td>
                                    <td class="right amount">{{ payment.cents | mad }}</td>
                                    <td>
                                        <span
                                            class="badge"
                                            [class.rejected]="payment.status === 'REJECTED'"
                                            >{{
                                                payment.status === 'POSTED' ? 'Posted' : 'Rejected'
                                            }}</span
                                        >
                                    </td>
                                </tr>
                            } @empty {
                                <tr>
                                    <td colspan="5" class="empty">
                                        No payments yet. Start with a new transfer.
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
export class Overview {
    readonly api = inject(BankApi);
}
