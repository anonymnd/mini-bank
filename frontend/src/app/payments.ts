import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BankApi, Payment, Result, message } from './api';
import { Icon, MadPipe } from './shared';
import { PaymentFilterStatus, filterPayments, paymentsCsv } from './payment-register';

const reference = () => 'WEB-' + crypto.randomUUID().slice(0, 18).toUpperCase();

@Component({
    selector: 'app-payments',
    imports: [DatePipe, ReactiveFormsModule, Icon, MadPipe],
    template: `
        <div class="page-heading">
            <div>
                <p class="eyebrow">PAYMENT OPERATIONS</p>
                <h1>Move money with certainty.</h1>
                <p class="subtitle">Create an internal transfer. Keep every movement traceable.</p>
            </div>
            <span class="pill"><span class="status-dot"></span> Internal transfers</span>
        </div>
        @if (error()) {
            <div class="notice error" role="alert">
                {{ error() }} <strong>Keep the same reference when retrying.</strong>
            </div>
        }
        @if (result(); as outcome) {
            <div
                class="notice"
                [class.error]="!outcome.ok"
                [class.success]="outcome.ok"
                role="status"
            >
                <strong>{{
                    outcome.ok ? 'Operation completed' : 'Request rejected — no new funds moved'
                }}</strong>
                <pre>{{ outcome.output }}</pre>
            </div>
        }
        <section class="panel transfer-panel">
            <div class="panel-heading">
                <div>
                    <h2>New transfer</h2>
                    <p>Transfers are posted atomically between two MAD accounts.</p>
                </div>
                <span class="step-label">01 / CREATE INSTRUCTION</span>
            </div>
            <form [formGroup]="form" (ngSubmit)="reviewTransfer()" class="transfer-form">
                <div class="form-grid">
                    <label
                        >From account<select
                            formControlName="source"
                            [attr.aria-invalid]="submitted() && form.controls.source.invalid"
                        >
                            <option value="">Choose debit account</option>
                            @for (account of api.state()?.accounts ?? []; track account.id) {
                                <option [value]="account.id">
                                    {{ account.id }} — {{ account.name }}
                                </option>
                            }
                        </select></label
                    ><label
                        >To account<select
                            formControlName="destination"
                            [attr.aria-invalid]="
                                submitted() && (form.controls.destination.invalid || sameAccount())
                            "
                        >
                            <option value="">Choose credit account</option>
                            @for (account of api.state()?.accounts ?? []; track account.id) {
                                <option [value]="account.id">
                                    {{ account.id }} — {{ account.name }}
                                </option>
                            }
                        </select></label
                    ><label
                        >Amount <span class="label-note">MAD</span
                        ><input
                            formControlName="amount"
                            inputmode="decimal"
                            placeholder="0.00"
                            aria-describedby="amount-help"
                            [attr.aria-invalid]="submitted() && form.controls.amount.invalid"
                        /><small id="amount-help"
                            >Use two decimals, for example 125.50. No commas.</small
                        ></label
                    ><label
                        >Unique payment reference<input
                            class="mono"
                            formControlName="reference"
                            maxlength="24"
                            aria-describedby="reference-help"
                            [attr.aria-invalid]="submitted() && form.controls.reference.invalid"
                        /><small id="reference-help"
                            >A–Z, 0–9, hyphen or underscore. Maximum 24 characters.</small
                        ></label
                    >
                </div>
                @if (submitted() && form.invalid) {
                    <p class="field-error" role="alert">
                        Choose both accounts, enter a positive amount with two decimals, and use a
                        valid reference.
                    </p>
                }
                @if (submitted() && sameAccount()) {
                    <p class="field-error" role="alert">
                        Source and destination must be different accounts.
                    </p>
                }
                <div class="form-footer">
                    <p><app-icon name="shield" /> You’ll review the details before posting.</p>
                    <button
                        class="button primary"
                        type="submit"
                        [disabled]="pending() || api.loading()"
                    >
                        Review transfer <app-icon name="arrow" />
                    </button>
                </div>
            </form>
        </section>
        <section class="panel">
            <div class="panel-heading">
                <div>
                    <h2>Payment register</h2>
                    <p>Latest 100 requests · posted payments and rejections</p>
                </div>
                <button
                    class="button secondary small"
                    (click)="exportPayments()"
                    [disabled]="!filteredPayments().length || api.loading() || !!api.error()"
                >
                    Export CSV
                </button>
            </div>
            <div class="register-filters" [formGroup]="registerFilters">
                <label class="register-search"
                    >Search payments<input
                        formControlName="query"
                        placeholder="Reference, account or reason"
                        type="search"
                /></label>
                <label
                    >Status<select formControlName="status">
                        <option value="ALL">All statuses</option>
                        <option value="POSTED">Posted</option>
                        <option value="REJECTED">Rejected</option>
                    </select></label
                >
                <button
                    class="button secondary small"
                    (click)="clearFilters()"
                    [disabled]="!filtersActive()"
                >
                    Clear filters
                </button>
            </div>
            <p class="register-count" role="status" aria-live="polite">
                Showing {{ filteredPayments().length }} of
                {{ api.state()?.payments?.length ?? 0 }} loaded requests. Search and export cover
                the latest 100 requests.
            </p>
            @if (exportMessage()) {
                <p class="register-count" role="status">{{ exportMessage() }}</p>
            }
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Reference / Date · UTC</th>
                            <th>From → To</th>
                            <th class="right">Amount · MAD</th>
                            <th>Status / Details</th>
                            <th><span class="sr-only">Action</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (payment of filteredPayments(); track payment.reference) {
                            <tr>
                                <td>
                                    <strong class="mono">{{ payment.reference }}</strong
                                    ><span class="cell-detail">{{
                                        payment.created_at | date: 'dd MMM yyyy, HH:mm' : 'UTC'
                                    }}</span>
                                </td>
                                <td class="mono movement">
                                    {{ payment.source }} <span>→</span> {{ payment.destination }}
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
                                    @if (payment.reason) {
                                        <span class="cell-detail mono reason">{{
                                            payment.reason
                                        }}</span>
                                    }
                                    @if (payment.reversal_of) {
                                        <span class="cell-detail"
                                            >Reversal of {{ payment.reversal_of }}</span
                                        >
                                    }
                                    @if (payment.reversed_by) {
                                        <span class="cell-detail"
                                            >Reversed by {{ payment.reversed_by }}</span
                                        >
                                    }
                                </td>
                                <td class="right">
                                    @if (
                                        payment.status === 'POSTED' &&
                                        !payment.reversal_of &&
                                        !payment.reversed_by
                                    ) {
                                        <button
                                            class="button small secondary"
                                            [disabled]="pending()"
                                            (click)="reviewReversal(payment)"
                                        >
                                            Reverse
                                        </button>
                                    }
                                </td>
                            </tr>
                        } @empty {
                            <tr>
                                <td colspan="5" class="empty">
                                    {{
                                        filtersActive()
                                            ? 'No payments match your filters. Try another search or clear the filters.'
                                            : 'Your first transfer will appear here.'
                                    }}
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        </section>
        <dialog #transferDialog aria-labelledby="transfer-title">
            <div class="dialog-content">
                <p class="eyebrow">REVIEW INSTRUCTION</p>
                <h2 id="transfer-title">Confirm this transfer</h2>
                <p>Check the accounts and amount before posting.</p>
                <dl class="review-details">
                    <div>
                        <dt>Debit account</dt>
                        <dd class="mono">{{ reviewed().source }}</dd>
                    </div>
                    <div>
                        <dt>Credit account</dt>
                        <dd class="mono">{{ reviewed().destination }}</dd>
                    </div>
                    <div>
                        <dt>Amount · MAD</dt>
                        <dd>{{ reviewed().amount }}</dd>
                    </div>
                    <div>
                        <dt>Reference</dt>
                        <dd class="mono">{{ reviewed().reference }}</dd>
                    </div>
                </dl>
                <div class="dialog-actions">
                    <button class="button secondary" (click)="transferDialog.close()">
                        Go back</button
                    ><button class="button primary" (click)="postTransfer()" [disabled]="pending()">
                        Confirm transfer
                    </button>
                </div>
            </div>
        </dialog>
        <dialog #reversalDialog aria-labelledby="reverse-title">
            <form [formGroup]="reversalForm" (ngSubmit)="postReversal()" class="dialog-content">
                <p class="eyebrow">COMPENSATING PAYMENT</p>
                <h2 id="reverse-title">Reverse this transfer?</h2>
                <p>
                    A new opposite payment returns the original amount. The original history is
                    preserved.
                </p>
                <dl class="review-details">
                    <div>
                        <dt>Original reference</dt>
                        <dd class="mono">{{ reversing()?.reference }}</dd>
                    </div>
                    <div>
                        <dt>Amount · MAD</dt>
                        <dd>{{ reversing()?.cents ?? 0 | mad }}</dd>
                    </div>
                </dl>
                <label
                    >New reversal reference<input
                        formControlName="reference"
                        class="mono"
                        maxlength="24"
                /></label>
                <div class="dialog-actions">
                    <button type="button" class="button secondary" (click)="reversalDialog.close()">
                        Cancel</button
                    ><button
                        class="button primary"
                        type="submit"
                        [disabled]="reversalForm.invalid || pending()"
                    >
                        Confirm reversal
                    </button>
                </div>
            </form>
        </dialog>
    `,
})
export class Payments {
    readonly api = inject(BankApi);
    private readonly fb = inject(FormBuilder).nonNullable;
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly registerFilters = this.fb.group({ query: '', status: 'ALL' as PaymentFilterStatus });
    private readonly filterValues = toSignal(this.registerFilters.valueChanges, {
        initialValue: this.registerFilters.getRawValue(),
    });
    readonly filtersActive = computed(
        () => !!this.filterValues().query?.trim() || this.filterValues().status !== 'ALL',
    );
    readonly filteredPayments = computed(() =>
        filterPayments(
            this.api.state()?.payments ?? [],
            this.filterValues().query ?? '',
            this.filterValues().status ?? 'ALL',
        ),
    );
    readonly exportMessage = signal('');
    readonly form = this.fb.group({
        source: ['', [Validators.required]],
        destination: ['', [Validators.required]],
        amount: [
            '',
            [
                Validators.required,
                Validators.pattern(/^[0-9]{1,9}\.[0-9]{2}$/),
                Validators.min(0.01),
            ],
        ],
        reference: [reference(), [Validators.required, Validators.pattern(/^[A-Z0-9_-]{1,24}$/)]],
    });
    readonly reversalForm = this.fb.group({
        reference: ['', [Validators.required, Validators.pattern(/^[A-Z0-9_-]{1,24}$/)]],
    });
    readonly reviewed = signal(this.form.getRawValue());
    readonly reversing = signal<Payment | null>(null);
    readonly result = signal<Result | null>(null);
    readonly error = signal('');
    readonly pending = signal(false);
    readonly submitted = signal(false);
    @ViewChild('transferDialog') transferDialog!: ElementRef<HTMLDialogElement>;
    @ViewChild('reversalDialog') reversalDialog!: ElementRef<HTMLDialogElement>;

    clearFilters() {
        this.registerFilters.setValue({ query: '', status: 'ALL' });
        this.exportMessage.set('');
    }
    exportPayments() {
        const rows = this.filteredPayments();
        if (!rows.length || this.api.loading() || this.api.error()) return;
        try {
            const csv = paymentsCsv(rows);
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `minibank-payments-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            // Let the browser begin reading the Blob before releasing its URL.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.exportMessage.set(
                `CSV download requested for ${rows.length} filtered payment${rows.length === 1 ? '' : 's'}.`,
            );
        } catch (error) {
            this.error.set(message(error));
        }
    }

    sameAccount() {
        return (
            !!this.form.controls.source.value &&
            this.form.controls.source.value === this.form.controls.destination.value
        );
    }
    reviewTransfer() {
        this.submitted.set(true);
        this.form.markAllAsTouched();
        if (this.pending()) return;
        if (this.form.invalid || this.sameAccount()) {
            this.host.nativeElement
                .querySelector<HTMLElement>(
                    'input.ng-invalid, select.ng-invalid, select[formControlName="destination"]',
                )
                ?.focus();
            return;
        }
        this.reviewed.set(this.form.getRawValue());
        this.transferDialog.nativeElement.showModal();
    }
    async postTransfer() {
        this.transferDialog.nativeElement.close();
        await this.execute('/transfers', this.reviewed());
    }
    reviewReversal(payment: Payment) {
        this.reversing.set(payment);
        this.reversalForm.setValue({ reference: reference() });
        this.reversalDialog.nativeElement.showModal();
    }
    async postReversal() {
        const original = this.reversing()?.reference;
        if (!original || this.reversalForm.invalid || this.pending()) return;
        this.reversalDialog.nativeElement.close();
        await this.execute('/reversals', {
            reference: this.reversalForm.controls.reference.value,
            original,
        });
    }
    private async execute(path: string, body: object) {
        if (this.pending()) return;
        this.pending.set(true);
        this.error.set('');
        this.result.set(null);
        try {
            this.result.set(await this.api.request<Result>(path, body));
            await this.api.refresh();
            // Preserve reference on rejection/technical uncertainty for safe retry.
            if (this.result()?.ok && path === '/transfers')
                this.form.controls.reference.setValue(reference());
        } catch (error) {
            this.error.set(message(error));
        } finally {
            this.pending.set(false);
        }
    }
}
