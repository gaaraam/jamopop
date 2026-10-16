import {Fragment} from 'react';
const tones:Record<string,string>={'■':'exact','▨':'present','·':'absent',solved:'exact',submitted:'cyan',forfeited:'red',finished:'muted'};
export function ConsolePrompt({name}:{name:string}){return <><span className="ansi-user">{name}@bubblecon</span><span className="ansi-muted">:</span><span className="ansi-path">~/wordle</span><span className="ansi-symbol"> $</span></>}
export function ConsoleOutput({text}:{text:string}){
 const lines=text.split('\n');
 return <>{lines.map((line,index)=>{const prompt=line.match(/^(.*)@bubblecon:~\/wordle \$(.*)$/);let content;
 if(prompt)content=<><ConsolePrompt name={prompt[1]}/><span className={prompt[2].trim().startsWith('/')?'ansi-command':''}>{prompt[2]}</span></>;
 else if(line.startsWith('-- '))content=<span className="ansi-cyan">{line}</span>;
 else if(/^ {2}[가-힣ㄱ-ㅣ]( [가-힣ㄱ-ㅣ])*$/.test(line)&&lines[index+1]?.trim().match(/^[■▨·]( [■▨·])*  \[/)){const marks=lines[index+1].match(/[■▨·]/g)||[];content=<>  {line.trim().split(' ').map((letter,i)=><Fragment key={i}>{i>0?' ':''}<span className={`ansi-${tones[marks[i]]||'muted'}`}>{letter}</span></Fragment>)}</>;}
 else content=line.split(/([■▨·]|\[\d{2}:\d{2}:\d{2}\]|\bsolved\b|\bsubmitted\b|\bforfeited\b|\bfinished\b|\/[a-z]+)/g).map((token,i)=><span key={i} className={tones[token]?`ansi-${tones[token]}`:/^\[\d/.test(token)?'ansi-muted':token.startsWith('/')?'ansi-command':undefined}>{token}</span>);
 return <Fragment key={index}>{index>0?'\n':''}{content}</Fragment>;})}</>;
}
