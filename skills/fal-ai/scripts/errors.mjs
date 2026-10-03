// Only messages authored locally may be printed; never expose remote bodies or raw transport errors.
export class InputError extends Error {}
export function fail(message) { throw new InputError(message); }
