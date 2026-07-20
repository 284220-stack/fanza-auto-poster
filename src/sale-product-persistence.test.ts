import assert from 'node:assert/strict';
import { persistSaleProducts } from './sale-product-persistence.js';
import type { Product } from './products.js';
const item=(id='a')=>({source:'sale' as const,externalProductId:id,title:'title',productUrl:'https://x.test/p',affiliateUrl:'https://x.test/a',price:100,salePrice:80,isSale:true,fetchedAt:new Date().toISOString()});
const existing:Product={id:1,fanzaProductId:'a',title:'old',productUrl:'https://old.test/p',affiliateUrl:'https://old.test/a',sampleVideoUrl:'https://old.test/v',thumbnailUrl:null,price:'120',salePrice:null,isSale:false,releaseDate:null,status:'available',createdAt:'',updatedAt:''};
let created=0,updated=0; const writer={async getByFanzaProductId(id:string){return id==='a'?existing:undefined},async create(){created++;return existing},async update(_id:number,input:unknown){updated++;assert.equal((input as {sampleVideoUrl:string}).sampleVideoUrl,'https://old.test/v');return existing}};
const provider={source:'sale' as const,async fetch(){return{source:'sale' as const,items:[item('a'),item('b'),item('b'),{...item('c'),affiliateUrl:undefined}],fetchedAt:new Date().toISOString(),warnings:['provider'],hasMore:false}}};
const result=await persistSaleProducts(provider,writer);assert.equal(updated,1);assert.equal(created,1);assert.equal(result.updatedCount,1);assert.equal(result.createdCount,1);assert.equal(result.skippedCount,2);assert.deepEqual(result.warnings,['provider','保存に必要な商品情報が不足しています。']);console.log('sale persistence: ok');
