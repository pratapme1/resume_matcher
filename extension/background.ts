// Resume Tailor Pro — Background Service Worker (MV3)
// Minimal: actual logic lives in content.ts and popup/Popup.tsx

chrome.runtime.onInstalled.addListener(() => {
  console.log('[RTP] Extension installed.');
});
