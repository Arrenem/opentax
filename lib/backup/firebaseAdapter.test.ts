import { describe, expect, it } from 'vitest';
import { Firestore } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import { FirebaseLedgerAdapter } from './firebaseAdapter';
const identity = {projectId:'demo-source',databaseId:'(default)',bucket:'demo-source-bucket',uid:'owner'};
const bucket = {name:identity.bucket} as Bucket;
describe('Firebase archive adapter safety',()=>{
  it('detects nested subcollections below a nonexistent ledger document',async()=>{
    const owner={listCollections:async()=>[{id:'journals'}],collection:()=>({listDocuments:async()=>[{listCollections:async()=>[{id:'history'}]}]})};
    const db={projectId:identity.projectId,databaseId:identity.databaseId,collection:()=>({doc:()=>owner})} as unknown as Firestore;
    await expect(new FirebaseLedgerAdapter(db,bucket,identity).scanRecords()).rejects.toThrow('Nested ledger');
  });
  it('rejects foreign project/database references before encoding even with matching path',async()=>{
    const foreign=new Firestore({projectId:'demo-foreign'});
    const foreignRef=foreign.doc('users/owner/journals/j');
    const query={limit:()=>query,get:async()=>({size:1,docs:[{id:'j',data:()=>({nested:[foreignRef]})}]})};
    const owner={listCollections:async()=>[{id:'journals'}],collection:()=>({listDocuments:async()=>[],orderBy:()=>query})};
    const db={projectId:identity.projectId,databaseId:identity.databaseId,collection:()=>({doc:()=>owner})} as unknown as Firestore;
    await expect(new FirebaseLedgerAdapter(db,bucket,identity).scanRecords()).rejects.toThrow('Cross-project/database');
    await foreign.terminate();
  });
  it('rejects unrelated access roots in an otherwise empty target',async()=>{
    const db={projectId:identity.projectId,databaseId:identity.databaseId,listCollections:async()=>[{id:'agentConnections'}]} as unknown as Firestore;
    await expect(new FirebaseLedgerAdapter(db,bucket,identity).assertRestoreIsolation()).rejects.toThrow('access grants');
  });
});
