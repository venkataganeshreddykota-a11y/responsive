export function loadJsonArray(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    if (Array.isArray(value)) return value;
  } catch {
    // Fall through and reset invalid data below.
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be blocked by privacy settings; callers can still use live data.
  }

  return [];
}

export function saveJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota, blocked storage, or private-profile failures.
  }
}
