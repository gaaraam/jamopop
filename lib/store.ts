import {env} from 'cloudflare:workers';
export function database():D1Database{if(!env.DB)throw new Error('STORAGE_UNAVAILABLE');return env.DB;}
export async function one<T=any>(sql:string,...values:any[]):Promise<T|null>{return database().prepare(sql).bind(...values).first<T>();}
export async function all<T=any>(sql:string,...values:any[]):Promise<T[]>{return (await database().prepare(sql).bind(...values).all<T>()).results;}
export async function run(sql:string,...values:any[]){return database().prepare(sql).bind(...values).run();}

export function adminAccountId(){return String((env as unknown as Record<string,unknown>).SITE_ADMIN_ACCOUNT_ID||'')}
