window.HUD = (() => {
  let state = null;
  let refresh = ()=>{};
  const listeners = [];
  const icon = id => id ? `/api/champion-icon?id=${id}` : '/placeholder.svg';
  const item = id => id ? `/api/item-icon?id=${id}` : '';
  const spell = key => key ? `/api/spell-icon?key=${encodeURIComponent(key)}` : '/placeholder.svg';
  const rune = id => id ? `/api/rune-icon?id=${id}` : '/placeholder.svg';
  const splash = pick => pick?.asset || (pick?.id ? `/api/champion-splash?id=${pick.id}&skin=${pick.skinId||0}` : '/placeholder.svg');
  const escape = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  async function init(cb) {
    if (cb) listeners.push(cb);
    const notify=next=>{if(next.blue)next.blue.color='#0050d1';if(next.red)next.red.color='#ff4f6d';state=next;for(const fn of listeners){try{fn(state)}catch(error){console.error('HUD render failed',error)}}};
    if(!['127.0.0.1','localhost','[::1]'].includes(location.hostname)){
      let last='',timer=null,inFlight=false,urgent=false;
      async function poll(){if(inFlight){urgent=true;return}inFlight=true;const started=performance.now();let failed=false;try{const response=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('외부 밴픽 연결 실패');const next=await response.json(),serialized=JSON.stringify(next);document.body.classList.remove('disconnected');if(serialized!==last){last=serialized;notify(next)}}catch(error){document.body.classList.add('disconnected');failed=true}finally{inFlight=false;const delay=urgent?0:failed?1500:Math.max(25,250-(performance.now()-started));urgent=false;timer=setTimeout(poll,delay)}}
      refresh=()=>{if(timer!==null)clearTimeout(timer);timer=null;if(inFlight)urgent=true;else poll()};
      poll();return;
    }
    const es = new EventSource('/api/events');
    es.onmessage = e => { try{notify(JSON.parse(e.data))}catch(error){console.error('HUD data failed',error)} };
    es.onerror = () => document.body.classList.add('disconnected');
    es.onopen = () => document.body.classList.remove('disconnected');
    try{
      const response=await fetch('/api/state');if(!response.ok)throw Error('HUD 연결 실패');
      const initial=await response.json();if(!state)notify(initial);
    }catch(error){document.body.classList.add('disconnected');console.warn('HUD reconnecting',error)}
  }
  async function update(patch) { return fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)}).then(r=>r.json()); }
  return { init, update, refresh:()=>refresh(), icon, item, spell, rune, splash, escape, get state(){return state;} };
})();
