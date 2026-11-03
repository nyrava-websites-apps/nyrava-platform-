import fs from 'node:fs';
import {randomUUID} from 'node:crypto';

// A failed write must preserve the previous settings and must not report success.
export function savePrivateSettings(file,value,io=fs){const temp=file+'.'+randomUUID()+'.tmp';try{io.writeFileSync(temp,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});JSON.parse(io.readFileSync(temp,'utf8'));io.renameSync(temp,file);}finally{if(io.existsSync(temp))io.unlinkSync(temp);}}
