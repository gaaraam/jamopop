export const KEYS=['ㅂㅈㄷㄱㅅㅛㅕㅑ','ㅁㄴㅇㄹㅎㅗㅓㅏㅣ','ㅋㅌㅊㅍㅠㅜㅡ'];
const INITIAL='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const VOWEL='ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const FINAL=['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const PARTS:Record<string,string>={'ㄲ':'ㄱㄱ','ㄸ':'ㄷㄷ','ㅃ':'ㅂㅂ','ㅆ':'ㅅㅅ','ㅉ':'ㅈㅈ','ㄳ':'ㄱㅅ','ㄵ':'ㄴㅈ','ㄶ':'ㄴㅎ','ㄺ':'ㄹㄱ','ㄻ':'ㄹㅁ','ㄼ':'ㄹㅂ','ㄽ':'ㄹㅅ','ㄾ':'ㄹㅌ','ㄿ':'ㄹㅍ','ㅀ':'ㄹㅎ','ㅄ':'ㅂㅅ','ㅐ':'ㅏㅣ','ㅒ':'ㅑㅣ','ㅔ':'ㅓㅣ','ㅖ':'ㅕㅣ','ㅘ':'ㅗㅏ','ㅙ':'ㅗㅏㅣ','ㅚ':'ㅗㅣ','ㅝ':'ㅜㅓ','ㅞ':'ㅜㅓㅣ','ㅟ':'ㅜㅣ','ㅢ':'ㅡㅣ'};
export function splitWord(value:string):string[]{return [...value.normalize('NFC')].flatMap(c=>{const n=c.charCodeAt(0)-0xac00;const raw=n>=0&&n<11172?INITIAL[Math.floor(n/588)]+VOWEL[Math.floor(n%588/28)]+FINAL[n%28]:c;return [...raw].flatMap(j=>[...(PARTS[j]||j)]);});}
export type Color='green'|'yellow'|'gray';
export function score(guess:string[],answer:string[]):Color[]{const out:Color[]=guess.map((x,i)=>x===answer[i]?'green':'gray');const remaining=answer.filter((_,i)=>out[i]!=='green');guess.forEach((x,i)=>{if(out[i]==='green')return;const at=remaining.indexOf(x);if(at>=0){out[i]='yellow';remaining.splice(at,1);}});return out;}
export type Guess={letters:string[];colors:Color[]};
export type Player={hintUsed?:boolean;forfeited?:boolean;id:string;name:string;avatar:string;skin?:string|null;online:boolean;colors:Color[][];status:string;attempts:number;finishedAt:number|null;rank?:number};

export function weekStart(now:number){const shifted=new Date(now+9*3600000);const day=(shifted.getUTCDay()+6)%7;return Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate()-day)-9*3600000;}
export type LiveState={id:string;phase:string;width:number;startsAt:number;endsAt:number|null;restricted:boolean;joined:boolean;ready:boolean;participants:{id:string;name:string;avatar:string;skin?:string|null;ready:boolean;status:string|null}[]};
export type PartyState={hintPolicy?:boolean;hintUsed?:boolean;spectator:boolean;nextParticipant:boolean;variant:string;loadout:null|{endsAt:number;attackUsed:boolean;support:string;supportUsed:boolean;defense:string;protectedUntil:number;damage:number};titles:{title:string;name:string;earnedAt:number}[];equipped:string;hints:{memberId:string;name:string;updatedAt:number}[];events:{id:string;actorId:string;targetId:string;effect:string;actor:string;target:string;createdAt:number}[]};
export type GameState={invitations?:any;chat?:import('../components/game/chat').ChatSnapshot;announcement?:{body:string;revision:number}|null;party?:PartyState;
 roster:{cardSkin?:string|null;title?:string;spectator?:boolean;id:string;name:string;avatar:string;skin?:string|null;linked:boolean;level:number|null;nameColor:string;avatarFrame:string;presence:'online'|'away'|'offline'}[];history:{id:string;answer:string;width:number;startsAt:number;participants:number;winners:number;myStatus:string|null;myAttempts:number|null}[];
 weekly:{id:string;name:string;avatar:string;skin?:string|null;wins:number;average:number;rank:number;blocked:number}[];weekLabel:string;
 reviews:{id:string;name:string;avatar:string;skin?:string|null;status:string;guesses:Guess[]}[];live:LiveState|null;wordCounts:Record<string,number>;
 room:{activeSpeedId?:string|null;id:string;name:string;isHost:boolean;isAdmin:boolean;hostId:string;inviteKey:string;liveId:string|null;roundNo:number;canReset:boolean;activeCount:number};
 me:{id:string;name:string;avatar:string};round:{dictionaryVersion:number;id:string;mode:string;width:number;phase:string;startsAt:number;endsAt:number|null;expired:boolean};
 play:{forfeited?:boolean;guesses:Guess[];status:string;answer?:string};players:Player[];reactions:import('./cheers').Cheer[];serverNow:number;date:string};

// Keep the roster stable; assign unique ranks from server-recorded completion times.
export function rankPlayers<T extends {id:string;status:string;attempts:number;finishedAt:number|null;hintUsed?:boolean}>(players:T[],mode:string){
 const winners=players.filter(p=>p.status==='won').sort((a,b)=>
  (mode==='live'?0:a.attempts-b.attempts)||
  (mode==='live'?0:Number(!!a.hintUsed)-Number(!!b.hintUsed))||
  (a.finishedAt??Number.MAX_SAFE_INTEGER)-(b.finishedAt??Number.MAX_SAFE_INTEGER)||
  (a.id<b.id?-1:a.id>b.id?1:0));
 const ranks=new Map(winners.map((p,i)=>[p.id,i+1]));
 return players.map(p=>({...p,rank:ranks.get(p.id)}));
}
