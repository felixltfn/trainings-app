import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { seedIfEmpty } from './seed';
import './styles.css';

async function boot(): Promise<void> {
  // Ask Safari not to evict our IndexedDB data when storage gets tight.
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch((e: unknown) => console.warn('storage.persist failed', e));
  }
  await seedIfEmpty();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot().catch((e: unknown) => {
  document.body.textContent = `Fehler beim Start: ${e instanceof Error ? e.message : String(e)}`;
});
