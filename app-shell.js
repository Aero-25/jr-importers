(() => {
    const APP_NAME = 'JR Importers';
    const STORE_URL = '/index.html';
    const ADMIN_URL = '/admin.html';
    const INSTALL_DISMISS_KEY = 'jr-app-install-dismissed';
    const ONLINE_TOAST_MS = 3500;

    let booted = false;
    let rootEl = null;
    let installPromptEvent = null;
    let waitingWorker = null;
    let reloadTriggered = false;
    let onlineToastTimer = null;

    function readInstallDismissed() {
        try {
            return sessionStorage.getItem(INSTALL_DISMISS_KEY) === '1';
        } catch {
            return false;
        }
    }

    function writeInstallDismissed(value) {
        try {
            if (value) {
                sessionStorage.setItem(INSTALL_DISMISS_KEY, '1');
            } else {
                sessionStorage.removeItem(INSTALL_DISMISS_KEY);
            }
        } catch {
            // Ignore storage restrictions.
        }
    }

    const state = {
        isOnline: navigator.onLine,
        toast: null,
        installDismissed: readInstallDismissed()
    };

    function injectStyles() {
        if (document.getElementById('jr-app-shell-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'jr-app-shell-styles';
        style.textContent = `
            #jr-app-shell-root {
                position: fixed;
                inset: auto 16px 16px auto;
                z-index: 100000;
                pointer-events: none;
            }

            .jr-shell-stack {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 12px;
            }

            .jr-shell-card {
                width: min(360px, calc(100vw - 32px));
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-radius: 20px;
                background:
                    linear-gradient(140deg, rgba(2, 6, 23, 0.96), rgba(15, 23, 42, 0.92));
                color: #e2e8f0;
                box-shadow:
                    0 20px 45px rgba(2, 6, 23, 0.45),
                    0 0 0 1px rgba(132, 204, 22, 0.08);
                backdrop-filter: blur(22px);
                overflow: hidden;
                pointer-events: auto;
            }

            .jr-shell-card__inner {
                padding: 16px;
            }

            .jr-shell-card__eyebrow {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.14em;
                text-transform: uppercase;
                color: #a3e635;
            }

            .jr-shell-card__title {
                margin-top: 8px;
                font-size: 18px;
                font-weight: 800;
                line-height: 1.25;
                color: #f8fafc;
            }

            .jr-shell-card__text {
                margin-top: 8px;
                font-size: 14px;
                line-height: 1.6;
                color: #94a3b8;
            }

            .jr-shell-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 16px;
            }

            .jr-shell-btn {
                appearance: none;
                border: 0;
                border-radius: 999px;
                padding: 11px 16px;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            }

            .jr-shell-btn:hover {
                transform: translateY(-1px);
            }

            .jr-shell-btn--primary {
                background: linear-gradient(135deg, #84cc16, #22c55e);
                color: #020617;
                box-shadow: 0 10px 24px rgba(132, 204, 22, 0.28);
            }

            .jr-shell-btn--secondary {
                background: rgba(30, 41, 59, 0.9);
                color: #e2e8f0;
                border: 1px solid rgba(148, 163, 184, 0.16);
            }

            .jr-shell-toast {
                border-left: 4px solid #22c55e;
            }

            .jr-shell-offline {
                border-left: 4px solid #f59e0b;
            }

            .jr-shell-update {
                border-left: 4px solid #84cc16;
            }

            .jr-shell-install {
                border-left: 4px solid #38bdf8;
            }

            @media (max-width: 640px) {
                #jr-app-shell-root {
                    inset: auto 12px 12px 12px;
                }

                .jr-shell-stack {
                    align-items: stretch;
                }

                .jr-shell-card {
                    width: 100%;
                }

                .jr-shell-actions {
                    flex-direction: column;
                }

                .jr-shell-btn {
                    width: 100%;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function ensureRoot() {
        if (rootEl && rootEl.isConnected) {
            return rootEl;
        }

        rootEl = document.getElementById('jr-app-shell-root');
        if (!rootEl) {
            rootEl = document.createElement('div');
            rootEl.id = 'jr-app-shell-root';
            rootEl.setAttribute('aria-live', 'polite');
            document.body.appendChild(rootEl);
        }

        if (!rootEl.dataset.bound) {
            rootEl.addEventListener('click', handleActionClick);
            rootEl.dataset.bound = '1';
        }

        return rootEl;
    }

    function isStandalone() {
        const standaloneMode = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
        return standaloneMode || window.navigator.standalone === true;
    }

    function renderCard(className, eyebrow, title, text, actions) {
        const actionMarkup = actions.length
            ? `<div class="jr-shell-actions">${actions.join('')}</div>`
            : '';

        return `
            <section class="jr-shell-card ${className}" role="status">
                <div class="jr-shell-card__inner">
                    <div class="jr-shell-card__eyebrow">${eyebrow}</div>
                    <div class="jr-shell-card__title">${title}</div>
                    <div class="jr-shell-card__text">${text}</div>
                    ${actionMarkup}
                </div>
            </section>
        `;
    }

    function render() {
        if (!document.body) {
            return;
        }

        injectStyles();
        const root = ensureRoot();
        const cards = [];

        if (!state.isOnline) {
            cards.push(
                renderCard(
                    'jr-shell-offline',
                    'Offline Mode',
                    'Connection lost',
                    'You can keep browsing cached pages while the network reconnects.',
                    [
                        `<button class="jr-shell-btn jr-shell-btn--secondary" data-jr-action="open-store">Open store</button>`,
                        `<button class="jr-shell-btn jr-shell-btn--secondary" data-jr-action="open-admin">Open admin</button>`
                    ]
                )
            );
        } else if (state.toast) {
            cards.push(
                renderCard(
                    state.toast.className || 'jr-shell-toast',
                    state.toast.eyebrow,
                    state.toast.title,
                    state.toast.text,
                    []
                )
            );
        }

        if (waitingWorker) {
            cards.push(
                renderCard(
                    'jr-shell-update',
                    'Fresh Version Ready',
                    'A new version is available',
                    'Refresh once to switch to the latest storefront and admin files.',
                    [
                        `<button class="jr-shell-btn jr-shell-btn--primary" data-jr-action="refresh-app">Refresh app</button>`,
                        `<button class="jr-shell-btn jr-shell-btn--secondary" data-jr-action="dismiss-update">Later</button>`
                    ]
                )
            );
        }

        if (installPromptEvent && !state.installDismissed && !isStandalone()) {
            cards.push(
                renderCard(
                    'jr-shell-install',
                    'Install App',
                    'Pin JR Importers to your device',
                    'Launch the store or admin faster with a standalone app experience.',
                    [
                        `<button class="jr-shell-btn jr-shell-btn--primary" data-jr-action="install-app">Install now</button>`,
                        `<button class="jr-shell-btn jr-shell-btn--secondary" data-jr-action="dismiss-install">Not now</button>`
                    ]
                )
            );
        }

        root.innerHTML = cards.length ? `<div class="jr-shell-stack">${cards.join('')}</div>` : '';
    }

    function showToast(toast) {
        state.toast = toast;
        window.clearTimeout(onlineToastTimer);
        onlineToastTimer = window.setTimeout(() => {
            state.toast = null;
            render();
        }, ONLINE_TOAST_MS);
        render();
    }

    async function promptInstall() {
        if (!installPromptEvent) {
            return;
        }

        try {
            await installPromptEvent.prompt();
            const choice = await installPromptEvent.userChoice;

            if (choice.outcome === 'accepted') {
                state.installDismissed = false;
                writeInstallDismissed(false);
            } else {
                state.installDismissed = true;
                writeInstallDismissed(true);
            }
        } catch (error) {
            window.console.warn('[JR Shell] Install prompt failed', error);
        } finally {
            installPromptEvent = null;
            render();
        }
    }

    function handleActionClick(event) {
        const actionTarget = event.target.closest('[data-jr-action]');
        if (!actionTarget) {
            return;
        }

        const action = actionTarget.dataset.jrAction;

        if (action === 'install-app') {
            promptInstall();
            return;
        }

        if (action === 'dismiss-install') {
            state.installDismissed = true;
            writeInstallDismissed(true);
            render();
            return;
        }

        if (action === 'refresh-app') {
            if (waitingWorker) {
                waitingWorker.postMessage({ type: 'SKIP_WAITING' });
                return;
            }

            window.location.reload();
            return;
        }

        if (action === 'dismiss-update') {
            waitingWorker = null;
            render();
            return;
        }

        if (action === 'open-store') {
            window.location.href = STORE_URL;
            return;
        }

        if (action === 'open-admin') {
            window.location.href = ADMIN_URL;
        }
    }

    function wireRegistration(registration) {
        if (registration.waiting) {
            waitingWorker = registration.waiting;
            render();
        }

        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) {
                return;
            }

            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    waitingWorker = registration.waiting || newWorker;
                    render();
                }
            });
        });
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            return null;
        }

        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            wireRegistration(registration);
            return registration;
        } catch (error) {
            window.console.warn('[JR Shell] Service worker registration failed', error);
            return null;
        }
    }

    function boot() {
        if (booted) {
            render();
            return;
        }

        booted = true;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', render, { once: true });
        } else {
            render();
        }

        window.addEventListener('online', () => {
            state.isOnline = true;
            showToast({
                className: 'jr-shell-toast',
                eyebrow: 'Back Online',
                title: 'Connection restored',
                text: 'JR Importers is online again and live updates are available.'
            });
        });

        window.addEventListener('offline', () => {
            state.isOnline = false;
            state.toast = null;
            render();
        });

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            installPromptEvent = event;
            state.installDismissed = readInstallDismissed();
            render();
        });

        window.addEventListener('appinstalled', () => {
            installPromptEvent = null;
            state.installDismissed = false;
            writeInstallDismissed(false);
            showToast({
                className: 'jr-shell-install',
                eyebrow: 'Installed',
                title: 'App ready',
                text: `${APP_NAME} is now available from your home screen.`
            });
        });

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (reloadTriggered) {
                    return;
                }

                reloadTriggered = true;
                window.location.reload();
            });

            registerServiceWorker();
        }
    }

    window.JRAppShell = {
        boot,
        registerServiceWorker
    };

    boot();
})();
