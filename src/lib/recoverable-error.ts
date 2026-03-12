function getErrorName(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "name" in error) {
    return String((error as { name: unknown }).name);
  }

  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return String(error);
}

export function isRecoverableAsyncError(error: unknown): boolean {
  const name = getErrorName(error);
  const message = getErrorMessage(error);

  return (
    name === "AbortError" ||
    name === "TimeoutError" ||
    message.includes("The operation timed out") ||
    message.includes("This operation was aborted")
  );
}
