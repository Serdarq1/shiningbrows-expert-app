// Run with NODE_PATH pointing to a jsdom installation.
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const rendered = execFileSync(process.env.PYTHON_BIN || 'python3', ['tests/render_fixtures.py'], {encoding:'utf8', env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
const fixtures = JSON.parse(rendered.trim().split('\n').at(-1));
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const source = name => fs.readFileSync(`static/js/${name}.js`, 'utf8');
const product = {id: 1, name: 'Brow Henna Dark', price: 250, usage: 'professional'};
async function page(name, language = 'en-US') {
  const dom = new JSDOM(fixtures[name], {url:`https://example.com/${name}`,runScripts:'outside-only'});
  await tick();
  Object.defineProperty(dom.window.navigator, 'languages', {value:[language]});
  dom.window.eval(source('locale'));
  return dom;
}
(async () => {
  for (const language of ['en-US','tr-TR','de-DE']) {
    const dom = await page('dashboard', language), w = dom.window;
    const calls = [];
    w.fetch = async url => {
      calls.push(url);
      return {ok:true,json:async()=> url === '/api/student' ? {id:123,name:'Test',role:'student'} : url === '/api/products' ? [product] : []};
    };
    w.eval(source('app'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    await tick();
    assert.deepEqual(calls, ['/api/student'], 'home must only fetch identity');
    w.goToSection('urun-bilgileri');
    await tick();
    assert.match(w.document.querySelector('#product-list img').src, /\.webp$/);
    w.goToSection('urunler');
    await tick();
    const catalog = w.document.getElementById('order-product-list');
    assert.equal(catalog.textContent.includes('₺'), language === 'tr-TR');
    catalog.querySelector('button').click();
    await tick();
    assert.match(w.document.getElementById('toast').textContent, language === 'tr-TR' ? /Sepete eklendi/ : /Added to cart/);
    assert.equal(JSON.parse(w.localStorage.getItem('sb_order_cart_v1'))[0].qty, 1);
    assert.equal(w.document.getElementById('order-cart').textContent.includes('₺'), language === 'tr-TR');
    const count = calls.length;
    w.goToSection('portal'); w.goToSection('urunler'); await tick();
    assert.equal(calls.length,count,'visited tabs retain loaded data');
    assert.equal(w.document.documentElement.lang,language === 'tr-TR' ? 'tr' : 'en');
    if(language !== 'tr-TR') assert.ok(w.document.body.textContent.includes('Quick tips'));
    dom.window.close();
  }
  for (const language of ['tr-TR', 'en-US']) {
    const dom=await page('product',language),w=dom.window;
    const script=[...w.document.scripts].find(script=>script.textContent.includes('const storageKey'));
    w.eval(script.textContent);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    assert.equal(w.document.getElementById('product-price').hidden, language !== 'tr-TR');
    w.document.getElementById('product-add-to-cart').click();
    await tick();
    assert.equal(w.document.getElementById('product-cart-popover').classList.contains('hidden'),false);
    assert.equal(JSON.parse(w.localStorage.getItem('sb_order_cart_v1'))[0].qty,1);
    dom.window.close();
  }
  {
    const dom=await page('dashboard'),w=dom.window;
    let calls=0, release;
    w.fetch=()=>{calls++;return new Promise(resolve=>release=resolve)};
    w.eval(source('app'));
    const a=w.fetchJSON('/test'),b=w.fetchJSON('/test');
    assert.equal(calls,1,'concurrent reads share one request');
    release({ok:true,json:async()=>({ok:true})}); await Promise.all([a,b]);
    dom.window.close();
  }
  for(const status of ['needs_second_factor','needs_first_factor','needs_new_password']) {
    const dom=await page('login'),w=dom.window;
    let mounted=0;
    w.Clerk={load:async()=>{},isSignedIn:false,client:{signIn:{create:async()=>({status})}},mountSignIn:()=>mounted++};
    w.eval(source('login'));w.dispatchEvent(new w.Event('load'));await tick();
    w.document.getElementById('email').value='test@example.com';
    w.document.getElementById('password').value='test-password';
    w.document.getElementById('sign-in-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.equal(mounted,1,`${status} must show verification, not an unexpected-step error`);
    dom.window.close();
  }
  {
    const dom=await page('login'),w=dom.window;
    let signedOut=false;
    w.Clerk={load:async()=>{},isSignedIn:true,session:{getToken:async()=> 'token'},signOut:async()=>{signedOut=true}};
    w.fetch=async()=>({ok:false,status:503});
    w.eval(source('login'));w.dispatchEvent(new w.Event('load'));await tick();
    assert.equal(signedOut,false);
    assert.match(w.document.getElementById('error-message').textContent,/not been signed out/);
    dom.window.close();
  }
  console.log('Passed: primary language, startup requests, tab reuse, images, cart feedback, price visibility, request deduplication, login verification and session outage recovery.');
})().catch(error=>{console.error(error);process.exitCode=1});
