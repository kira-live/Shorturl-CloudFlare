import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));
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
app.get("*", (c) => c.json({ message: "all" }));

export default app;
