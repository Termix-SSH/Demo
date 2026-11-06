import { post } from "../../router";

const P = "/plugin-api/web-endpoint";

post(`${P}/open`, () => ({ port: 41080 }));
post(`${P}/proxy`, () => ({ path: "/plugin-api/web-endpoint/p/demo-token/" }));
post(`${P}/open-window`, () => ({ ok: true }));
