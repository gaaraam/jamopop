import {spawnSync} from 'node:child_process';
const env={...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false'};
for(const [bin,args] of [['vite/bin/vite.js',['build','--config','vite.config.ts']],['../scripts/db-local.mjs',[]],['wrangler/bin/wrangler.js',['dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--port','5173','--inspector-port','0']]]){
 const r=spawnSync(process.execPath,['node_modules/'+bin,...args],{env,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);
}
