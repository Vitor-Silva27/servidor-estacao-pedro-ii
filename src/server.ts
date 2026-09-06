import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API no ar em http://localhost:${env.PORT} (docs em /docs)`);
});
