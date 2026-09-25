import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { buildBackup, importBackup } from './backup';
import { getMeta } from './db';
import { applyPlanFixes, applyStretchFixes, seedIfEmpty, seedStretchesIfEmpty } from './seed';
import { installAudio, setLockScreenSound } from './signal';
import './styles.css';

// The service worker activates itself (autoUpdate). As soon as it takes over, the
// page reloads once, so a new version is visible on the first start – not the second.
function reloadOnUpdate(): void {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  // Check for a new version whenever the app comes back to the foreground
  const check = () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then((r) => r?.update().catch(() => {}));
    }
  };
  document.addEventListener('visibilitychange', check);
  window.setTimeout(check, 3000);
}

async function boot(): Promise<void> {
  // Ask Safari not to evict our IndexedDB data when storage gets tight.
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch((e: unknown) => console.warn('storage.persist failed', e));
  }
  await seedIfEmpty();
  await applyPlanFixes();
  await seedStretchesIfEmpty();
  await applyStretchFixes();
  reloadOnUpdate();
  installAudio();
  setLockScreenSound((await getMeta<boolean>('lockScreenSound')) ?? true);
  // Test hook for the dev console (not part of the production build)
  if (import.meta.env.DEV) Object.assign(window, { backupTools: { buildBackup, importBackup } });
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot().catch((e: unknown) => {
  document.body.textContent = `Fehler beim Start: ${e instanceof Error ? e.message : String(e)}`;
});
