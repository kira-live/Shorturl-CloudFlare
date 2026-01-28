import { Hono } from "hono";
import auth, {authVerify} from "./auth";
import {ErrorCode, HttpResponseJsonBody} from "./util";
import redirect from "./redirect";
const app = new Hono<{ Bindings: Env }>();
app.use(authVerify)
app.onError((err, c) => {
    console.error(`${err}`)
    const response:HttpResponseJsonBody = {message:'something went wrong!',code:ErrorCode.UNKNOWN_ERROR};
    return c.json(response, 500)
})
app.route('/api/auth/',auth)
app.get("/",(c)=> c.redirect("/"+__WEB_LOCATION__+"/"));
app.get("/"+__WEB_LOCATION__+"/*", async  (c)=>
{

    const url = c.req.path.replace("/"+__WEB_LOCATION__+"/", "");
    console.log(url);
    const resp = await c.env.ASSETS.fetch("https://assets.local/"+url);
    if (resp.status === 404)
    {
        return c.env.ASSETS.fetch("https://assets.local/index.html");
    }
    return resp;
});
app.route('/', redirect);

export default app;
