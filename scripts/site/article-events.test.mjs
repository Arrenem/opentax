import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const code=await readFile(new URL('../../site/article-events.js',import.meta.url),'utf8');
function setup(overrides={}) {
  const listeners={}; const events=[]; let observe;
  const metadata={id:'guide-1',category:'how-to',articleType:'howto',productPlacement:'contextual-example',status:'published',relatedPaths:['/articles/related','/private?email=person@example.com'],...overrides.metadata};
  const window={opentaxAnalytics:{measurementId:'G-TEST1',publicPaths:['/','/articles/related','/docs/mcp']},opentaxAnalyticsInitialized:true,dataLayer:events,...overrides.window};
  const context={window,navigator:overrides.navigator||{},location:{hostname:'opentax.fragmentware.com',origin:'https://opentax.fragmentware.com',href:'https://opentax.fragmentware.com/articles/guide?email=person@example.com#secret'},URL,document:{getElementById:()=>({textContent:JSON.stringify(metadata)}),querySelector:()=>({}),addEventListener:(name,fn)=>{listeners[name]=fn;}},IntersectionObserver:class {constructor(fn){observe=fn;}observe(){}disconnect(){}}};
  vm.runInNewContext(code,context);listeners.DOMContentLoaded();
  return {events,listeners,complete:()=>observe?.([{isIntersecting:true}]),click:(href)=>listeners.click?.({target:{closest:()=>({getAttribute:()=>href,closest:()=>true,matches:()=>false})}})};
}
test('controlled article events contain no query/hash/content and completion once',()=>{
  const fixture=setup(); fixture.complete();fixture.complete();fixture.click('/articles/related?email=person@example.com#secret');fixture.click('/?name=private#secret');fixture.click('/docs/mcp?secret=1');
  assert.deepEqual(fixture.events.map(e=>e[1]),['article_view','article_complete','related_article_click','opentax_link_click','setup_docs_click']);
  assert.doesNotMatch(JSON.stringify(fixture.events),/email|person@|secret|private|page_view/);
});
test('draft, missing GA, disabled GA, GPC and DNT never emit',()=>{
  for(const overrides of [{metadata:{status:'draft'}},{navigator:{globalPrivacyControl:true}},{navigator:{doNotTrack:'1'}},{window:{'ga-disable-G-TEST1':true}},{window:{opentaxAnalytics:{measurementId:'',publicPaths:[]}}}]) {
    const fixture=setup(overrides);fixture.complete();fixture.click('/');assert.equal(fixture.events.length,0);
  }
});
