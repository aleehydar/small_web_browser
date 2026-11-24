const ADDRESS = /^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?\.zz$/;

export function canonicalize(
  input: string,
): { ok: true; address: string } | { ok: false } {
  let address = input.trim().toLowerCase();
  if (address.startsWith('web://')) {
    address = address.slice('web://'.length);
  }
  if (address.endsWith('/')) {
    address = address.slice(0, -1);
  }
  if (!ADDRESS.test(address)) {
    return { ok: false };
  }
  return { ok: true, address };
}
