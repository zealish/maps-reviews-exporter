// Background service worker — keeps downloads & messaging working.
// MV3 requires a service_worker field if declared; this file is intentionally minimal.

chrome.runtime.onInstalled.addListener(() => {
  console.log("Maps Reviews Exporter installed.");
});
