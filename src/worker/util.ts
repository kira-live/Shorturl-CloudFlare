type HttpResponseJsonBody<T=null> = {
    data?:T;
    message: string;
    code: number;
}
enum ErrorCode {
    DATA_INPUT_ERROR = -1,
    UNAUTHORIZED = -2,
    UNKNOWN_ERROR = -999,
    SUCCESS = 0
}
export {ErrorCode};
export type { HttpResponseJsonBody};
