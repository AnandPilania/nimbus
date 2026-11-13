import type { Bundle, Json, NodeDef } from '@/nimbus/types'

const N = (id: string, type: string, props: Record<string, Json> = {}, extra: Partial<NodeDef> = {}): NodeDef => ({ id, type, props, ...extra })

/** A form field bound to state.form.<name>; every field shares the one `setField` handler. */
const FIELD = (id: string, type: string, name: string, props: Record<string, Json> = {}, extra: Partial<NodeDef> = {}): NodeDef =>
    N(id, type, { name, value: `{!state.form.${name}}`, ...props }, { on: { change: 'setField' }, ...extra })

const INDUSTRIES = ['Manufacturing', 'Energy', 'Software', 'Biotech', 'Retail', 'Finance']

export const samples: Record<string, Bundle> = {
    customerDirectory: {
        apiName: 'customerDirectory',
        label: 'Customer directory',
        props: [],
        state: { selected: [], refresh: 0, viewing: null },
        data: {},
        handlers: {
            pick: [{ type: 'set', key: 'selected', value: '{!$event.rows}' }],
            rowAction: [{ type: 'if', cond: '$event.action == "delete"', then: 'remove', else: 'view' }],
            view: [{ type: 'set', key: 'viewing', value: '{!$event.row}' }],
            closeView: [{ type: 'set', key: 'viewing', value: null }],
            remove: [{ type: 'fetch', url: '/api/records/Account/{!$event.row.id}', method: 'DELETE', then: 'removed' }],
            removed: [
                { type: 'set', key: 'refresh', value: '{!state.refresh + 1}' },
                { type: 'toast', message: 'Account deleted', variant: 'success' },
            ],
        },
        template: N('root', 'Stack', { gap: 4 }, {
            children: [
                N('h', 'Heading', { text: 'Customers', level: '1' }),
                N('sub', 'Text', { text: 'Server-side search, filters, sorting and paging. Rows are fetched from /api/records/Account.', muted: true }),
                N('sel', 'Alert', { variant: 'info', title: '{!len(state.selected)} selected', text: '{!join(pluck(state.selected, "name"))}' }, { if: 'len(state.selected) > 0' }),
                N('tbl', 'DataTable', {
                    url: '/api/records/Account',
                    version: '{!state.refresh}',
                    pageSize: 10,
                    selectable: true,
                    exportable: true,
                    columns: [
                        { key: 'name', label: 'Account', sortable: true, filter: 'text' },
                        { key: 'industry', label: 'Industry', type: 'badge', sortable: true, filter: { type: 'select', options: INDUSTRIES } },
                        { key: 'revenue', label: 'Revenue', type: 'currency', sortable: true, align: 'right' },
                        { key: 'employees', label: 'Employees', type: 'number', sortable: true, align: 'right' },
                        { key: 'active', label: 'Active', type: 'boolean' },
                        { key: 'created', label: 'Created', type: 'date', sortable: true },
                    ],
                    actions: [
                        { name: 'view', label: 'View' },
                        { name: 'delete', label: 'Delete', variant: 'ghost', confirm: 'Delete this account?', perm: 'accounts.delete' },
                    ],
                }, { on: { select: 'pick', rowAction: 'rowAction' } }),
                N('dlg', 'Modal', { open: '{!state.viewing != null}', title: '{!state.viewing.name}', description: 'Account details' }, {
                    on: { close: 'closeView' },
                    children: [
                        N('d1', 'Badge', { text: '{!state.viewing.industry}' }),
                        N('d2', 'Text', { text: 'Employees: {!state.viewing.employees}   Website: {!state.viewing.website}' }),
                        N('d3', 'Button', { label: 'Close', variant: 'outline' }, { on: { click: 'closeView' } }),
                    ],
                }),
            ],
        }),
    },
    signupForm: {
        apiName: 'signupForm',
        label: 'Sign-up form',
        props: [],
        state: {
            form: { name: '', email: '', password: '', confirm: '', country: '', manager: '', interests: [], plan: 'free', newsletter: true, terms: false, avatar: [] },
            saving: false, done: false, serverErrors: {},
        },
        data: {},
        handlers: {
            setField: [
                { type: 'set', key: 'form.{!$event.name}', value: '{!$event.value}' },
                { type: 'set', key: 'serverErrors.{!$event.name}', value: '' },
            ],
            submit: [
                { type: 'set', key: 'serverErrors', value: {} },
                { type: 'fetch', url: '/api/demo/signup', method: 'POST', body: '{!$event.values}', loading: 'saving', then: 'saved', catch: 'failed' },
            ],
            invalid: [{ type: 'toast', message: 'Please fix the highlighted fields', variant: 'error' }],
            saved: [{ type: 'set', key: 'done', value: true }, { type: 'toast', message: 'Account created for {!state.form.name}', variant: 'success' }],
            failed: [{ type: 'set', key: 'serverErrors', value: '{!$event.errors}' }, { type: 'toast', message: '{!$event.message}', variant: 'error' }],
            again: [{ type: 'set', key: 'done', value: false }],
        },
        template: N('root', 'Card', { title: 'Create your account', description: 'Validation, selects, autocomplete, file upload and progress', width: 640 }, {
            children: [
                N('steps', 'Steps', { steps: 'Account,Preferences,Done', current: '{!state.done ? 2 : (len(state.form.password) >= 8 ? 1 : 0)}' }),
                N('prog', 'Progress', {
                    label: 'Form completion',
                    showValue: true,
                    value: '{!(len(state.form.name) > 1) * 25 + (len(state.form.email) > 3) * 25 + (len(state.form.password) >= 8) * 25 + (state.form.terms == true) * 25}',
                }, { if: '!state.done' }),
                N('ok', 'Alert', { variant: 'success', title: 'You are all set', text: 'Welcome, {!state.form.name}.' }, { if: 'state.done' }),
                N('again', 'Button', { label: 'Start over', variant: 'outline' }, { if: 'state.done', on: { click: 'again' } }),
                N('form', 'Form', {}, {
                    if: '!state.done',
                    on: { submit: 'submit', invalid: 'invalid' },
                    children: [
                        N('g1', 'Grid', { columns: 2, gap: 4 }, {
                            children: [
                                FIELD('name', 'Input', 'name', { label: 'Full name', required: true, minLength: 2 }),
                                FIELD('email', 'Input', 'email', { label: 'Email', type: 'email', required: true, error: '{!state.serverErrors.email}', help: 'Try taken@example.com to see a server-side error' }),
                                FIELD('pw', 'Input', 'password', { label: 'Password', type: 'password', required: true, minLength: 8 }),
                                FIELD('pw2', 'Input', 'confirm', { label: 'Confirm password', type: 'password', required: true, error: '{!state.form.confirm != state.form.password ? "Passwords must match" : ""}' }),
                                FIELD('country', 'Select', 'country', { label: 'Country', required: true, options: 'India, United States, Germany, Japan' }),
                                FIELD('mgr', 'Autocomplete', 'manager', { label: 'Parent account', placeholder: 'Search accounts...', searchUrl: '/api/lookups/Account' }),
                            ],
                        }),
                        FIELD('int', 'MultiSelect', 'interests', { label: 'Interests', options: 'Analytics, Automation, Integrations, Security, Billing', required: true }),
                        FIELD('plan', 'RadioGroup', 'plan', { label: 'Plan', options: [{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }, { value: 'team', label: 'Team' }], direction: 'row' }),
                        FIELD('avatar', 'FileUpload', 'avatar', { label: 'Profile picture', accept: 'image/*', maxSize: 5, multiple: false, uploadUrl: '/api/files' }),
                        FIELD('news', 'Switch', 'newsletter', { label: 'Send me product updates' }),
                        FIELD('terms', 'Checkbox', 'terms', { label: 'I accept the terms', required: true }),
                        N('go', 'Button', { label: 'Create account', submit: true, loading: '{!state.saving}' }),
                    ],
                }),
            ],
        }),
    },
    objectDemo: {
        apiName: 'objectDemo',
        label: 'Object-driven UI',
        props: [],
        state: {},
        data: {},
        handlers: { created: [{ type: 'toast', message: 'Would create {!$event.values.name}', variant: 'success' }] },
        template: N('root', 'Stack', { gap: 4 }, {
            children: [
                N('h', 'Heading', { text: 'Generated from object metadata', level: '1' }),
                N('sub', 'Text', { text: 'Fields, types, picklists and required rules come from GET /api/meta/objects/Account.', muted: true }),
                N('tabs', 'Tabs', { tabs: 'Record form,List view' }, {
                    children: [
                        N('f', 'RecordForm', { object: 'Account', columns: 2, submitLabel: 'Create account' }, { on: { submit: 'created' } }),
                        N('t', 'DataTable', { object: 'Account', url: '/api/records/Account', pageSize: 10 }),
                    ],
                }),
            ],
        }),
    },

    accountList: {
        apiName: 'accountList',
        label: 'Account List',
        props: [],
        state: { query: '', selected: '' },
        data: {
            accounts: {
                value: [
                    { name: 'Acme Corp', industry: 'Manufacturing', revenue: 120 },
                    { name: 'Globex', industry: 'Energy', revenue: 340 },
                    { name: 'Initech', industry: 'Software', revenue: 58 },
                    { name: 'Umbrella', industry: 'Biotech', revenue: 910 },
                ],
            },
        },
        handlers: {
            search: [{ type: 'set', key: 'query', value: '{!$event.value}' }],
            pick: [{ type: 'set', key: 'selected', value: '{!$event}' }],
        },
        template: N('root', 'Stack', { gap: 4 }, {
            children: [
                N('h', 'Heading', { text: 'Accounts', level: '1' }),
                N('q', 'Input', { placeholder: 'Search accounts...', value: '{!state.query}' }, { on: { change: 'search' } }),
                N('sel', 'Badge', { text: 'Selected: {!state.selected}' }, { if: 'state.selected' }),
                N('grid', 'Stack', { direction: 'row', wrap: true, gap: 4 }, {
                    children: [
                        N('card', 'accountCard', { name: '{!item.name}', industry: '{!item.industry}', revenue: '{!item.revenue}' }, {
                            each: { items: 'data.accounts', as: 'item' },
                            if: 'item.name ~ state.query',
                            on: { select: 'pick' },
                        }),
                    ],
                }),
            ],
        }),
    },
    accountCard: {
        apiName: 'accountCard',
        label: 'Account Card',
        props: [
            { name: 'name', type: 'string', default: 'Acme' },
            { name: 'industry', type: 'string', default: 'Technology' },
            { name: 'revenue', type: 'number', default: 0 },
        ],
        state: {},
        data: {},
        handlers: { open: [{ type: 'emit', event: 'select', detail: '{!props.name}' }] },
        template: N('root', 'Card', { title: '{!props.name}', description: '{!props.industry}', width: 260 }, {
            children: [
                N('rev', 'Text', { text: 'Annual revenue: ${!props.revenue}M', muted: true }),
                N('btn', 'Button', { label: 'Open', variant: 'outline' }, { on: { click: 'open' } }),
            ],
        }),
    },
    counter: {
        apiName: 'counter',
        label: 'Counter',
        props: [{ name: 'step', type: 'number', default: 1 }],
        state: { count: 0 },
        data: {},
        handlers: {
            inc: [{ type: 'set', key: 'count', value: '{!state.count + props.step}' }],
            reset: [{ type: 'set', key: 'count', value: 0 }, { type: 'toast', message: 'Counter reset' }],
        },
        template: N('root', 'Card', { title: 'Counter', description: 'State, handlers and conditionals', width: 320 }, {
            children: [
                N('v', 'Heading', { text: '{!state.count}', level: '2' }),
                N('hot', 'Badge', { text: 'On fire', variant: 'destructive' }, { if: 'state.count >= 5' }),
                N('row', 'Stack', { direction: 'row' }, {
                    children: [
                        N('b1', 'Button', { label: 'Add {!props.step}' }, { on: { click: 'inc' } }),
                        N('b2', 'Button', { label: 'Reset', variant: 'ghost' }, { on: { click: 'reset' } }),
                    ],
                }),
            ],
        }),
    },
}
