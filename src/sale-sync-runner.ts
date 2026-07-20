import { persistSaleProducts, type PersistenceResult, type ProductWriter } from './sale-product-persistence.js';
import type { ProductProvider } from './providers.js';
export type SyncStatus='success'|'partial_success'|'failed';
export type SyncResult=PersistenceResult&{durationMs:number;status:SyncStatus};
export type Logger={info(message:string):void;error(message:string):void};
export type SyncOptions={provider:ProductProvider;writer:ProductWriter;logger?:Logger;persist?:typeof persistSaleProducts};
export class SaleSyncRunner{constructor(private readonly options:SyncOptions){} async run():Promise<SyncResult>{const started=Date.now();const log=this.options.logger;log?.info('セール同期を開始しました。');try{const result=await (this.options.persist??persistSaleProducts)(this.options.provider,this.options.writer);const status:SyncStatus=result.failedCount===0?'success':result.createdCount+result.updatedCount>0?'partial_success':'failed';const sync={...result,durationMs:Date.now()-started,status};log?.info('セール同期を完了しました。');return sync;}catch{const now=new Date().toISOString();log?.error('セール同期に失敗しました。');return{startedAt:now,completedAt:now,durationMs:Date.now()-started,fetchedCount:0,createdCount:0,updatedCount:0,skippedCount:0,failedCount:1,warnings:[],errors:[{productId:'unknown',message:'セール同期に失敗しました。'}],status:'failed'};}}}
