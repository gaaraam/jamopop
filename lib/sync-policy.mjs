export const PRESENCE_INTERVAL=15000;
export const PRESENCE_OFFLINE=45000;
export function pollDelay({idleMs=0,finished=false,chatOpen=false,lobby=false}={}){
 if(chatOpen)return 3000;
 if(idleMs>=90000)return 15000;
 if(lobby)return 10000;
 return finished?10000:3000;
}
export function createRevisionCache(limit=128){
 const entries=new Map();
 return async function memo(key,revision,load){
  const old=entries.get(key);if(old&&old.revision===revision&&old.expires>Date.now())return old.promise;
  const entry={revision,expires:Date.now()+60000,promise:Promise.resolve().then(load)};
  entries.delete(key);entries.set(key,entry);while(entries.size>limit)entries.delete(entries.keys().next().value);
  try{return await entry.promise}catch(e){if(entries.get(key)===entry)entries.delete(key);throw e}
 };
}
