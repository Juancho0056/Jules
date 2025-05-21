export type Success<T> = {
  ok: true;
  value: T;
};

export type Failure<E extends Error = Error> = {
  ok: false;
  error: E;
};

export type Result<T, E extends Error = Error> = Success<T> | Failure<E>;

// Optional: Helper functions to create Success and Failure objects
export const success = <T>(value: T): Success<T> => ({ ok: true, value });
export const failure = <E extends Error = Error>(error: E): Failure<E> => ({ ok: false, error });
