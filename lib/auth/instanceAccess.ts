/** Server-only policy. Unconfigured existing deployments retain their UID-isolated access. */
export function isAllowedInstanceUser(userId: string): boolean {
  const mode = process.env.OPENTAX_ACCESS_MODE;
  const owner = process.env.OPENTAX_OWNER_UID;
  // A configured UID always restricts access, even if legacy was accidentally left set.
  if (mode !== undefined && mode !== '' && mode !== 'owner' && mode !== 'legacy') return false;
  if ((mode === undefined || mode === '' || mode === 'legacy') && !owner) return true;
  if (!owner || owner.length > 128 || owner.trim() !== owner || /[\x00-\x1f\x7f]/.test(owner)) return false;
  return userId === owner;
}
