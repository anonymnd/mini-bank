import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BankApi, Result, message } from './api';
import { Icon } from './shared';

@Component({
    selector: 'app-batches',
    imports: [DatePipe, Icon],
    template: `
        <div class="page-heading">
            <div>
                <p class="eyebrow">BATCH OPERATIONS</p>
                <h1>Bring the day’s payments together.</h1>
                <p class="subtitle">
                    Import a payment file, review its outcome, and replay safely.
                </p>
            </div>
        </div>
        @if (error()) {
            <p class="notice error" role="alert">{{ error() }}</p>
        }
        @if (result(); as result) {
            <div
                class="notice"
                [class.success]="result.ok"
                [class.error]="!result.ok"
                role="status"
            >
                <strong>{{
                    result.ok ? 'Batch completed' : 'Batch completed with rejected lines'
                }}</strong>
                <pre>{{ result.output }}</pre>
                <small
                    >Retained as {{ result.file_name }}. Replay the same instructions using
                    unchanged references.</small
                >
            </div>
        }
        <div class="batch-grid">
            <section class="panel upload-panel">
                <div class="panel-heading">
                    <div>
                        <h2>Import payment file</h2>
                        <p>Fixed-width ASCII · .dat or .txt · up to 256 KiB</p>
                    </div>
                    <app-icon name="upload" />
                </div>
                <div class="upload-body">
                    <label class="upload-area"
                        ><span class="upload-circle"><app-icon name="upload" /></span
                        ><strong>{{ file()?.name || 'Choose a payment file' }}</strong
                        ><span>52 characters per instruction. No header row.</span
                        ><input
                            #fileInput
                            type="file"
                            accept=".dat,.txt,text/plain"
                            (change)="choose($event)"
                            [disabled]="pending()"
                    /></label>
                    <div class="form-footer">
                        <p>
                            {{
                                file()
                                    ? file()!.size + ' bytes selected'
                                    : 'Files are retained for safe replay.'
                            }}
                        </p>
                        <button
                            class="button primary"
                            [disabled]="!file() || pending()"
                            (click)="review()"
                        >
                            {{ pending() ? 'Processing…' : 'Review import' }}
                            <app-icon name="arrow" />
                        </button>
                    </div>
                </div>
            </section>
            <aside class="panel file-guide">
                <p class="eyebrow">FILE CONTRACT</p>
                <h2>One line. One instruction.</h2>
                <dl>
                    <div>
                        <dt>01–24</dt>
                        <dd>Unique reference</dd>
                    </div>
                    <div>
                        <dt>25–32</dt>
                        <dd>Debit account</dd>
                    </div>
                    <div>
                        <dt>33–40</dt>
                        <dd>Credit account</dd>
                    </div>
                    <div>
                        <dt>41–52</dt>
                        <dd>Amount: 000000100.00</dd>
                    </div>
                </dl>
                <p>
                    Repeated references keep their original result. Changed instructions need a new
                    reference.
                </p>
            </aside>
        </div>
        <section class="panel">
            <div class="panel-heading">
                <div>
                    <h2>Batch run history</h2>
                    <p>Latest 100 runs · timestamps in UTC</p>
                </div>
                <span class="pill">{{ api.state()?.runs?.length ?? 0 }} runs shown</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Run / File</th>
                            <th>Started · UTC</th>
                            <th>Status</th>
                            <th class="right">Posted</th>
                            <th class="right">Retried</th>
                            <th class="right">Rejected</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (run of api.state()?.runs ?? []; track run.id) {
                            <tr>
                                <td>
                                    <strong>Run #{{ run.id }}</strong
                                    ><span class="cell-detail mono filename">{{
                                        run.file_name
                                    }}</span>
                                </td>
                                <td>{{ run.started_at | date: 'dd MMM yyyy, HH:mm' : 'UTC' }}</td>
                                <td>
                                    <span
                                        class="badge"
                                        [class.warning]="run.status === 'RUNNING'"
                                        >{{
                                            run.status === 'COMPLETED' ? 'Completed' : 'Incomplete'
                                        }}</span
                                    >
                                </td>
                                <td class="right amount">
                                    {{ run.status === 'COMPLETED' ? run.posted : '—' }}
                                </td>
                                <td class="right amount">
                                    {{ run.status === 'COMPLETED' ? run.retried : '—' }}
                                </td>
                                <td class="right amount">
                                    {{ run.status === 'COMPLETED' ? run.rejected : '—' }}
                                </td>
                            </tr>
                        } @empty {
                            <tr>
                                <td colspan="6" class="empty">
                                    No imports yet. Choose your first payment file above.
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        </section>
        <section class="panel detail-panel">
            <div class="panel-heading">
                <div>
                    <h2>Rejected input lines</h2>
                    <p>Latest 100 entries · no funds moved for these instructions</p>
                </div>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Run</th>
                            <th>Line</th>
                            <th>Rejection reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (
                            reject of api.state()?.rejects ?? [];
                            track reject.run_id + '-' + reject.line_number
                        ) {
                            <tr>
                                <td>#{{ reject.run_id }}</td>
                                <td>{{ reject.line_number }}</td>
                                <td class="mono reason">{{ reject.reason }}</td>
                            </tr>
                        } @empty {
                            <tr>
                                <td colspan="3" class="empty">No rejected lines to review.</td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>
        </section>
        <dialog #dialog aria-labelledby="import-title">
            <div class="dialog-content">
                <p class="eyebrow">REVIEW BATCH</p>
                <h2 id="import-title">Process this payment file?</h2>
                <p>{{ file()?.name }} · {{ file()?.size }} bytes</p>
                <p>
                    Eligible instructions will move funds immediately. Invalid instructions will be
                    recorded as rejected. The original file is retained for replay.
                </p>
                <div class="dialog-actions">
                    <button class="button secondary" (click)="dialog.close()">Cancel</button
                    ><button class="button primary" [disabled]="pending()" (click)="upload()">
                        Confirm import
                    </button>
                </div>
            </div>
        </dialog>
    `,
})
export class Batches {
    readonly api = inject(BankApi);
    readonly file = signal<File | null>(null);
    readonly pending = signal(false);
    readonly error = signal('');
    readonly result = signal<Result | null>(null);
    @ViewChild('dialog') dialog!: ElementRef<HTMLDialogElement>;
    choose(event: Event) {
        this.error.set('');
        const file = (event.target as HTMLInputElement).files?.[0] ?? null;
        if (file && file.size > 256 * 1024) {
            this.file.set(null);
            this.error.set('Payment files are limited to 256 KiB.');
            return;
        }
        this.file.set(file);
    }
    review() {
        if (this.file() && !this.pending()) this.dialog.nativeElement.showModal();
    }
    async upload() {
        const file = this.file();
        if (!file || this.pending()) return;
        this.dialog.nativeElement.close();
        this.pending.set(true);
        this.error.set('');
        this.result.set(null);
        try {
            const content = await file.text();
            this.result.set(
                await this.api.request<Result>('/batches', { name: file.name, content }),
            );
            await this.api.refresh();
        } catch (error) {
            this.error.set(message(error));
        } finally {
            this.pending.set(false);
        }
    }
}
