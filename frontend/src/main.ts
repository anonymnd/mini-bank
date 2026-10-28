import { Component, inject, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { DatePipe } from '@angular/common';
import { provideRouter, RouterLink, RouterLinkActive, RouterOutlet, Routes } from '@angular/router';
import { BankApi } from './app/api';
import { Icon } from './app/shared';
import { Overview } from './app/overview';
import { Accounts } from './app/accounts';
import { Payments } from './app/payments';
import { Batches } from './app/batches';
import { Controls } from './app/controls';

const routes: Routes = [
    { path: '', component: Overview, title: 'Overview · MiniBank' },
    { path: 'accounts', component: Accounts, title: 'Accounts · MiniBank' },
    { path: 'payments', component: Payments, title: 'Payments · MiniBank' },
    { path: 'batches', component: Batches, title: 'Batch operations · MiniBank' },
    { path: 'controls', component: Controls, title: 'Financial controls · MiniBank' },
    { path: '**', redirectTo: '' },
];

@Component({
    selector: 'app-root',
    imports: [DatePipe, RouterLink, RouterLinkActive, RouterOutlet, Icon],
    template: `
        <a href="#main-content" class="skip-link">Skip to content</a>
        <aside class="sidebar">
            <a routerLink="/" class="brand" aria-label="MiniBank overview"
                ><span class="brand-mark">m<span>.</span></span
                ><span
                    >mini<span class="brand-light">bank</span
                    ><small>OPERATIONS WORKSPACE</small></span
                ></a
            >
            <div class="workspace-label">YOUR WORKSPACE</div>
            <nav aria-label="Main navigation">
                @for (item of navigation; track item.path) {
                    <a
                        [routerLink]="item.path"
                        [attr.aria-label]="item.label"
                        routerLinkActive="active"
                        [routerLinkActiveOptions]="{ exact: true }"
                        ariaCurrentWhenActive="page"
                        ><app-icon [name]="item.icon" />{{ item.label
                        }}<span class="nav-arrow" aria-hidden="true">›</span></a
                    >
                }
            </nav>
            <div class="sidebar-bottom">
                <div class="environment">
                    <span class="status-dot"></span>
                    <div><strong>Local environment</strong><span>Fictional data · MAD</span></div>
                </div>
                <div class="operator">
                    <span class="operator-avatar">OP</span>
                    <div><strong>Operations desk</strong><span>Local operator</span></div>
                </div>
            </div>
        </aside>
        <div class="workspace">
            <header class="topbar">
                <div class="breadcrumb">
                    Workspace <span>/</span> <strong>Banking operations</strong>
                </div>
                <div class="topbar-right">
                    <span class="date-label">{{ today | date: 'EEE, dd MMM yyyy' }}</span
                    ><span class="workspace-badge"
                        ><span class="status-dot"></span> Local workspace</span
                    >
                </div>
            </header>
            <main id="main-content" tabindex="-1">
                <div class="content">
                    <div class="refresh-row">
                        <span><span class="tiny-line"></span> ACCOUNT & PAYMENT OPERATIONS</span
                        ><button
                            class="refresh-button"
                            [disabled]="api.loading()"
                            (click)="api.refresh()"
                            aria-label="Refresh workspace data"
                        >
                            <app-icon name="refresh" />{{
                                api.loading() ? 'Refreshing…' : 'Refresh data'
                            }}
                        </button>
                    </div>
                    @if (api.error()) {
                        <div class="notice error" role="alert">
                            <strong>Workspace data could not be refreshed.</strong>
                            <p>{{ api.error() }} Previously displayed data may be stale.</p>
                            <button class="button secondary small" (click)="api.refresh()">
                                Try again
                            </button>
                        </div>
                    }
                    @if (api.loading() && !api.state()) {
                        <div class="loading-state" role="status">
                            <span class="loading-mark"></span>Loading your workspace…
                        </div>
                    } @else {
                        <router-outlet />
                    }
                </div>
                <footer class="workspace-footer">
                    <span>MiniBank <span class="footer-dot">·</span> Banking operations</span
                    ><span>Local demo. Fictional customers and funds.</span>
                </footer>
            </main>
        </div>
    `,
})
class App {
    readonly api = inject(BankApi);
    readonly today = new Date();
    readonly navigation = [
        { path: '/', label: 'Overview', icon: 'grid' },
        { path: '/accounts', label: 'Accounts', icon: 'accounts' },
        { path: '/payments', label: 'Payments', icon: 'payments' },
        { path: '/batches', label: 'Batch operations', icon: 'batches' },
        { path: '/controls', label: 'Financial controls', icon: 'shield' },
    ];
    constructor() {
        void this.api.refresh();
    }
}

bootstrapApplication(App, {
    providers: [provideRouter(routes), provideZonelessChangeDetection()],
}).catch(console.error);
