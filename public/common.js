window.HUD = (() => {
  let state = null;
  let refresh = ()=>{};
  let lastContact=0;
  const listeners = [];
  const icon = id => id ? `/api/champion-icon?id=${id}` : '/placeholder.svg';
  const item = id => id ? `/api/item-icon?id=${id}` : '';
  const spell = key => key ? `/api/spell-icon?key=${encodeURIComponent(key)}` : '/placeholder.svg';
  const rune = id => id ? `/api/rune-icon?id=${id}` : '/placeholder.svg';
  const splash = pick => pick?.asset || (pick?.id ? `/api/champion-splash?id=${pick.id}&skin=${pick.skinId||0}` : '/placeholder.svg');
  const escape = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function syncClock(target, serverNow, started) {
    if (!Number.isFinite(serverNow)) return false;
    const received=performance.now();
    target.serverNow=serverNow;
    target.clockSync={serverNow,received,rtt:started===null?0:Math.max(0,received-started)};
    return true;
  }
  async function init(cb,{onClock}={}) {
    if (cb) listeners.push(cb);
    const contact=()=>{
      lastContact=performance.now();
      document.body.classList.remove('disconnected');
    };
    const disconnected=()=>document.body.classList.add('disconnected');
    const render=(fn)=>{try{fn(state)}catch(error){console.error('HUD render failed',error)}};
    const notify=(next,started=null)=>{
      syncClock(next,next.serverNow,started);
      if(next.blue)next.blue.color='#0050d1';
      if(next.red)next.red.color='#ff4f6d';
      state=next;
      for(const fn of listeners)render(fn);
    };
    if(!['127.0.0.1','localhost','[::1]'].includes(location.hostname)){
      let last='',timer=null,inFlight=false,urgent=false;
      async function poll(){
        if(inFlight){urgent=true;return}
        inFlight=true;
        const started=performance.now();
        let failed=false;
        try{
          const response=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(5000)});
          if(!response.ok)throw Error('HUD 연결 실패');
          const next=await response.json();
          const {serverNow,...payload}=next;
          const serialized=JSON.stringify(payload);
          contact();
          if(serialized!==last){
            last=serialized;
            notify(next,started);
          }else if(syncClock(state,serverNow,started)&&onClock){
            render(onClock);
          }
        }catch(error){
          disconnected();
          failed=true;
        }finally{
          inFlight=false;
          const delay=urgent?0:failed?1500:Math.max(25,250-(performance.now()-started));
          urgent=false;
          timer=setTimeout(poll,delay);
        }
      }
      refresh=()=>{if(timer!==null)clearTimeout(timer);timer=null;if(inFlight)urgent=true;else poll()};
      poll();return;
    }
    const es = new EventSource('/api/events');
    es.onmessage = e => { try{const data=JSON.parse(e.data);contact();notify(data)}catch(error){console.error('HUD data failed',error)} };
    es.onerror = disconnected;
    es.onopen = contact;
    let supportsHeartbeat=false;
    es.addEventListener('heartbeat',()=>{supportsHeartbeat=true;contact();});
    setInterval(()=>{if(supportsHeartbeat&&performance.now()-lastContact>6500)disconnected();},1000);
    try{
      const started=performance.now(),response=await fetch('/api/state');if(!response.ok)throw Error('HUD 연결 실패');
      const initial=await response.json();contact();if(!state)notify(initial,started);
    }catch(error){disconnected();console.warn('HUD reconnecting',error)}
  }
  async function update(patch) { return fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)}).then(r=>r.json()); }
  return { init, update, refresh:()=>refresh(), icon, item, spell, rune, splash, escape, get state(){return state;} };
})();
