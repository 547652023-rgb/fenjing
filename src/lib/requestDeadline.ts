export function withDeadline<T>(
  request: Promise<T>,
  milliseconds: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException("操作已取消", "AbortError"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error(message));
    }, milliseconds);
    request.then(value => {
      finish();
      resolve(value);
    }, error => {
      finish();
      reject(error);
    });
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}
