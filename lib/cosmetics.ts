export const AVATARS=['🐱','🐻','🐰','🦊','🐼','🐸','🐨','🐯','🐶','🐹','🐮','🐷','🐵','🦁','🐧','🐥','🦉','🦆','🐙','🦦','🦋','🐢','🦕','🦄'];
export const NAME_COLORS=[{id:'default',name:'기본',level:1,hex:'#344158'},{id:'blue',name:'블루',level:2,hex:'#477bac'},{id:'mint',name:'민트',level:3,hex:'#388577'},{id:'rose',name:'로즈',level:4,hex:'#b95e7f'},{id:'violet',name:'바이올렛',level:5,hex:'#8963b3'},{id:'gold',name:'골드',level:7,hex:'#a37a28'}];
export const AVATAR_FRAMES=[{id:'none',name:'기본',level:1,icon:'○'},{id:'halo',name:'오로라',level:3,icon:'◉'},{id:'star',name:'별빛',level:5,icon:'✦'},{id:'crown',name:'왕관',level:10,icon:'♛'}];
export function canEquip(color:unknown,frame:unknown,level:number){return NAME_COLORS.some(c=>c.id===color&&c.level<=level)&&AVATAR_FRAMES.some(f=>f.id===frame&&f.level<=level)}
export function equippedAtLevel(color:string|null,frame:string|null,level:number){return {nameColor:NAME_COLORS.find(c=>c.id===color&&c.level<=level)?.id||'default',avatarFrame:AVATAR_FRAMES.find(f=>f.id===frame&&f.level<=level)?.id||'none'}}
export function avatarLevel(avatar:string){const i=AVATARS.indexOf(avatar);return i<0?Infinity:i<8?1:i<12?2:i<16?4:i<20?6:8}
export function unlockedAvatars(level:number,retained:string[]=[]){return AVATARS.filter(a=>avatarLevel(a)<=level||retained.includes(a))}
