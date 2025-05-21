
export class Result<T> {
    public isSuccess: boolean;
    public value: T | null; // Changed to T | null to align with Value being nullable if T is nullable
    public errors: string[] | null; // Changed to string[] | null

    public constructor(isSuccess: boolean, value: T | null, errors: Iterable<string> | null) { // Allow null for errors
        this.isSuccess = isSuccess;
        this.value = value;
        this.errors = errors ? Array.from(errors) : null;
    }

    public static Success<T>(value: T): Result<T> {
        return new Result<T>(true, value, null); // No errors for success
    }

    // Optional: Success with a warning (maps to a single error string)
    public static SuccessWithWarning<T>(value: T, warning: string): Result<T> {
        return new Result<T>(true, value, [warning]);
    }

    public static Failure<T>(error: string): Result<T> {
        return new Result<T>(false, null, [error]); // Value is null for failure
    }

    public static FailureFromErrors<T>(errors: Iterable<string>): Result<T> {
        return new Result<T>(false, null, errors); // Value is null for failure
    }
}
