import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// ==================== تسجيل الـ Service Worker (PWA / أوفلاين) ====================
// بنسجّله بس على http/https (مش file:// بتاع Electron ولا الاختبارات)،
// وبنستنى تحميل الصفحة عشان ما نزاحمش أول رسم.
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.protocol === 'http:')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((err) => {
        // فشل التسجيل مش كارثة — التطبيق شغال عادي من غيره
        console.warn('[sw] registration failed:', err);
      });
  });
}
