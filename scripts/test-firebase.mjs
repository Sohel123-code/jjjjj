import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
// Uses installed Java, or the optional project-local test runtime. No downloads.
const env={...process.env};
const dir=resolve('tmp/java');
if(existsSync(dir)){
 const java=readdirSync(dir).map(name=>resolve(dir,name,'bin')).find(path=>existsSync(resolve(path,process.platform==='win32'?'java.exe':'java')));
 if(java)env.PATH=java+delimiter+env.PATH;
}
const result=spawnSync(process.execPath,[resolve('node_modules/firebase-tools/lib/bin/firebase.js'),'emulators:exec','--only','firestore','--project','demo-polygon-tests','node --test --test-isolation=none tests/firebase.integration.test.js'],{env,stdio:'inherit',shell:false});
process.exit(result.status??1);
