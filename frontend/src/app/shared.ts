import { Component, Input, Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'mad' })
export class MadPipe implements PipeTransform {
    transform(cents: number): string {
        return new Intl.NumberFormat('en-GB', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(cents / 100);
    }
}

@Component({
    selector: 'app-icon',
    template: `<svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path [attr.d]="paths[name] || paths['grid']" />
    </svg>`,
    styles: [
        `
            :host {
                display: inline-flex;
                width: 20px;
                height: 20px;
                flex-shrink: 0;
            }
            svg {
                width: 100%;
                height: 100%;
            }
        `,
    ],
})
export class Icon {
    @Input() name = 'grid';
    readonly paths: Record<string, string> = {
        grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
        accounts: 'M3 10h18 M4 21h16 M5 10v11 M10 10v11 M14 10v11 M19 10v11 M2 7l10-5 10 5v3H2z',
        payments: 'M4 7h16 M16 3l4 4-4 4 M20 17H4 M8 13l-4 4 4 4',
        batches:
            'M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9z M14 2v7h7 M7 14h10 M7 18h6',
        shield: 'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6',
        arrow: 'M5 12h14 M13 6l6 6-6 6',
        plus: 'M12 5v14 M5 12h14',
        refresh: 'M20 7a8 8 0 1 0 0 10 M20 2v5h-5',
        search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
        check: 'M5 12l4 4L19 6',
        upload: 'M12 16V3 M7 8l5-5 5 5 M3 16v5h18v-5',
        logout: 'M9 3H3v18h6 M10 12h11 M17 8l4 4-4 4',
        clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    };
}
