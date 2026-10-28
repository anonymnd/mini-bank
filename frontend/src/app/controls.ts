import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BankApi, Result, message } from './api';
import { Icon } from './shared';

@Component({
    selector: 'app-controls',
    imports: [DatePipe, Icon],
    template: `
        <div class="page-heading">
            <div>
                <p class="eyebrow">FINANCIAL CONTROLS</p>
                <h1>Trust the ledger. Verify the detail.</h1>
                <p class="subtitle">Run a consistent check of your financial records.</p>
            </div>
            <button class="button primary" [disabled]="pending()" (click)="run()">
                <app-icon name="shield" />{{ pending() ? 'Checking…' : 'Run reconciliation' }}
            </button>
        </div>
        @if (error()) {
            <p class="notice error" role="alert">{{ error() }}</p>
        }
        <section class="panel control-result">
            <span class="control-symbol" [class.failed]="result() && !result()!.ok"
                ><app-icon [name]="result()?.ok ? 'check' : 'shield'"
            /></span>
            <p class="eyebrow">RECONCILIATION STATUS</p>
            <h2>
                {{
                    pending()
                        ? 'Verifying financial records…'
                        : result()
                          ? result()!.ok
                              ? 'All financial checks passed.'
                              : 'Discrepancies need your attention.'
                          : 'Ready when you are.'
                }}
            </h2>
            <p>
                {{
                    result()
                        ? 'Result at ' +
                          (checkedAt() | date: 'HH:mm:ss') +
                          '. Run again after new activity.'
                        : 'No reconciliation has run in this browser session.'
                }}
            </p>
            @if (result(); as result) {
                <pre class="control-output" role="status">{{ result.output }}</pre>
            } @else {
                <p class="control-hint">
                    The check reads a consistent snapshot. It does not change balances.
                </p>
            }
        </section>
        <div class="control-grid">
            @for (control of controls; track control.title) {
                <article class="panel control-card">
                    <app-icon name="shield" />
                    <h3>{{ control.title }}</h3>
                    <p>{{ control.description }}</p>
                </article>
            }
        </div>
        <aside class="notice info">
            <strong>When a check fails</strong>
            <p>
                Stop new processing, investigate the discrepancy, and use the recovery procedure.
                Never repair a balance by editing ledger records directly.
            </p>
        </aside>
    `,
})
export class Controls {
    readonly api = inject(BankApi);
    readonly result = signal<Result | null>(null);
    readonly pending = signal(false);
    readonly error = signal('');
    readonly checkedAt = signal(new Date());
    readonly controls = [
        {
            title: 'Balance integrity',
            description: 'Account balances match their opening funds and all ledger movements.',
        },
        {
            title: 'Paired postings',
            description: 'Every posted payment has two matching, opposite ledger entries.',
        },
        {
            title: 'Reversal relationships',
            description: 'Reversals match the original accounts and exact payment amount.',
        },
        {
            title: 'Storage & batch controls',
            description:
                'Integer money, foreign keys, storage integrity and completed rejection counts.',
        },
    ];
    async run() {
        this.pending.set(true);
        this.error.set('');
        this.result.set(null);
        try {
            this.result.set(await this.api.request<Result>('/reconcile', {}));
            this.checkedAt.set(new Date());
            await this.api.refresh();
        } catch (error) {
            this.error.set(message(error));
        } finally {
            this.pending.set(false);
        }
    }
}
