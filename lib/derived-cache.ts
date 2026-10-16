import {one} from './store';
import {createRevisionCache} from './sync-policy.mjs';
export const derivedCache=createRevisionCache();
export async function dataRevision(){return (await one('SELECT version FROM derived_revision WHERE id=1'))?.version||0}
