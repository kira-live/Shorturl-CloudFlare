import { Hono } from "hono";
import auth, {authVerify} from "./auth";
import {ErrorCode, HttpResponseJsonBody} from "./util";
import redirect from "./redirect";
import assets from "./assets";
import domain from "./api/domain";
import user from "./api/user";
import templateAssets from "./api/template-assets";
import template from "./api/template";
import shortlink from "./api/shortlink";
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
    //console.log(url);
    const resp = await c.env.ASSETS.fetch("https://assets.local/"+url);
    if (resp.status === 404)
    {
        return c.env.ASSETS.fetch("https://assets.local/index.html");
    }
    return resp;
});
app.route('/assets/',assets);

app.route('/api/domain/',domain)
app.route('/api/user/',user)
app.route('/api/template-assets/', templateAssets)
app.route('/api/template/', template)
app.route('/api/shortlink/', shortlink)

app.route('/', redirect);

export default app;
