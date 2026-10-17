let owners = 0;
let latest: any;
export function ownSync() {
  owners++;
  return () => {
    owners = Math.max(0, owners - 1);
  };
}
export function hasSync() {
  return owners > 0;
}
export function publishNotice(announcement: any) {
  latest = announcement;
  window.dispatchEvent(new CustomEvent('jamopop-notice', { detail: announcement }));
}
export function latestNotice() {
  return latest;
}

let invitations: any;
let roomContext: any = null;
export function publishInvitations(value: any) {
  if (value === undefined) return;
  invitations = value;
  window.dispatchEvent(new CustomEvent('jamopop-invitations', { detail: value }));
}
export function latestInvitations() {
  return invitations;
}
export function publishRoom(value: { id: string; name: string } | null) {
  roomContext = value;
  window.dispatchEvent(new CustomEvent('jamopop-room', { detail: value }));
}
export function latestRoom() {
  return roomContext;
}
