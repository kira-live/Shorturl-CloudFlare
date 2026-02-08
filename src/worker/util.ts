type HttpResponseJsonBody<T=null> = {
    data?:T;
    message: string;
    code: number;
}
enum ErrorCode {
    DATA_INPUT_ERROR = -1,
    UNAUTHORIZED = -2,
    SHORTURL_NOT_FOUND = -3,
    LINK_EXPIRED = -4,
    LINK_LIMIT_REACHED = -5,
    UNKNOWN_ERROR = -999,
    SUCCESS = 0
}
// 定义当前用户信息接口
type CurrentUser = {
    id: number;
    username: string;
    role: string;
}
type Variables = {
    currentUser: CurrentUser
}
export {ErrorCode};
export type { HttpResponseJsonBody , Variables,CurrentUser};
