type SoloState={active:unknown;best:Record<string,number>;xp:number};
const emptySolo=()=>({best:{},recent:[],active:null,xp:0});
import {one,database} from './store';
export function hasSoloRecord(state:SoloState){return !!state.active||Object.keys(state.best).length>0||state.xp>0}
export async function guestSoloStatus(guest:string|null,id:string){
 if(!guest)return {pending:false,conflict:false};
 const row=await one('SELECT state FROM solo_progress WHERE owner=?','guest:'+guest);
 if(!row||!hasSoloRecord(JSON.parse(row.state)))return {pending:false,conflict:false};
 const account=await one('SELECT state FROM solo_progress WHERE owner=?','account:'+id);
 return {pending:true,conflict:!!account&&hasSoloRecord(JSON.parse(account.state))};
}
// Only an empty account can receive the guest snapshot. Never merge or replace two runs.
export async function linkGuestSolo(guest:string|null,id:string){
 if(!guest)return;
 const from='guest:'+guest,to='account:'+id;
 const row=await one('SELECT state,revision FROM solo_progress WHERE owner=?',from);
 if(!row||!hasSoloRecord(JSON.parse(row.state)))return;
 const account=await one('SELECT state,revision FROM solo_progress WHERE owner=?',to);
 if(account&&hasSoloRecord(JSON.parse(account.state)))return;
 const db=database(),initial=JSON.stringify(emptySolo());
 await db.batch([
 db.prepare('INSERT INTO solo_progress(owner,state,revision) VALUES(?,?,0) ON CONFLICT(owner) DO NOTHING').bind(to,initial),
 db.prepare(`UPDATE solo_progress SET state=?,revision=revision+1 WHERE owner=? AND revision=? AND state=? AND EXISTS(SELECT 1 FROM solo_progress g WHERE g.owner=? AND g.revision=? AND g.state=?)`).bind(row.state,to,account?.revision||0,account?.state||initial,from,row.revision,row.state),
 db.prepare(`UPDATE solo_runs SET owner=? WHERE owner=? AND EXISTS(SELECT 1 FROM solo_progress a WHERE a.owner=? AND a.revision=? AND a.state=?) AND EXISTS(SELECT 1 FROM solo_progress g WHERE g.owner=? AND g.revision=? AND g.state=?)`).bind(to,from,to,(account?.revision||0)+1,row.state,from,row.revision,row.state),
 db.prepare(`UPDATE solo_progress SET state=?,revision=revision+1 WHERE owner=? AND revision=? AND state=? AND EXISTS(SELECT 1 FROM solo_progress a WHERE a.owner=? AND a.revision=? AND a.state=?)`).bind(initial,from,row.revision,row.state,to,(account?.revision||0)+1,row.state)
 ]);
 const remaining=await one('SELECT state FROM solo_progress WHERE owner=?',from);
 if(remaining&&hasSoloRecord(JSON.parse(remaining.state)))throw Error('다른 창에서 도전이 바뀌었어요. 다시 연결해 주세요.');
}
