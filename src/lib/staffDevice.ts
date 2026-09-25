/**
 * Whether this browser belongs to the shop.
 *
 * The console sets it whenever staff are signed in; the storefront's visit
 * counter reads it. Kept apart from the counter so the console does not ship
 * the counter just to set one flag.
 */

const STAFF_DEVICE_KEY = 'jr-staff-device';

/**
 * Marks this browser as the shop's own.
 *
 * The console shares the storefront's origin, so the flag is visible to the
 * shop too, and a staff phone stays uncounted after its owner signs out. The
 * database separately refuses visits from anyone signed in with a staff role.
 */
export function markStaffDevice() {
  try {
    window.localStorage.setItem(STAFF_DEVICE_KEY, '1');
  } catch {
    /* storage refused — the database's own staff check still applies */
  }
}

export function isStaffDevice(): boolean {
  try {
    return window.localStorage.getItem(STAFF_DEVICE_KEY) === '1';
  } catch {
    return false;
  }
}
