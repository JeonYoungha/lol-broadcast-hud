window.DraftPreview = {
  async start(render) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/draft-preview.css'; document.head.appendChild(link);
    document.body.classList.add('draft-preview-mode');
    const fit = () => document.documentElement.style.setProperty('--preview-scale', Math.max(.1, Math.min(innerWidth / 1920, (innerHeight - 70) / 1080, 1)));
    fit(); addEventListener('resize', fit);
    const sample = await fetch('/api/state').then(response => response.json());
    if(new URLSearchParams(location.search).has('fearless'))sample.fearless={games:[{picks:[1,2,3,4,5,6,7,8,9,10]},{picks:[11,12,13,14,15,16,17,18,19,20]}]};
    let pending = [];
    const emit = () => render(sample);
    function reset() {
      pending.forEach(clearTimeout); pending = [];
      sample.draft.blueBans = [0,0,0,0,0];
      sample.draft.redBans = [0,0,0,0,0];
      for (const side of ['blue','red']) sample.draft[side+'Picks'] = Array.from({length:5}, () => ({id:0,name:'',locked:false}));
      sample.draft.phase = 'BAN PHASE'; sample.draft.timer = 30;
      sample.draft.activeBanSlots={blue:0,red:-1};
      emit();
    }
    const later = (delay, action) => pending.push(setTimeout(() => { action(); emit(); }, delay));
    function sequence() {
      reset();
      const turns=[['blue',0,99],['red',0,238],['blue',1,1],['red',1,84],['blue',2,103],['red',2,157]];
      turns.forEach(([side,index,id],i)=>later(1000+i*2000,()=>{
        sample.draft[side+'Bans'][index]=id;
        const next=turns[i+1];
        sample.draft.activeBanSlots={blue:-1,red:-1};
        if(next)sample.draft.activeBanSlots[next[0]]=next[1];
        else sample.draft.phase='PICK PHASE';
      }));
      later(12500, () => { sample.draft.bluePicks[0] = {id:89,name:'LEONA',locked:false}; });
      later(14000, () => { sample.draft.bluePicks[0].locked = true; sample.draft.redPicks[0] = {id:222,name:'JINX',locked:false}; });
      later(15500, () => { sample.draft.redPicks[0].locked = true; });
      later(16500, () => { sample.draft.phase='BAN PHASE';sample.draft.activeBanSlots={blue:-1,red:3}; });
      const second=[['red',3,64],['blue',3,412],['red',4,58],['blue',4,111]];
      second.forEach(([side,index,id],i)=>later(18000+i*2000,()=>{
        sample.draft[side+'Bans'][index]=id;
        const next=second[i+1];sample.draft.activeBanSlots={blue:-1,red:-1};
        if(next)sample.draft.activeBanSlots[next[0]]=next[1];
        else sample.draft.phase='PICK PHASE';
      }));
    }
    const panel = document.createElement('div');
    panel.className = 'draft-preview-controls';
    panel.innerHTML = '<span>밴픽 HUD 미리보기</span><button data-action="sequence">전체 재생</button><button data-action="reset">초기화</button><small>실제 밴픽 데이터는 변경되지 않습니다</small>';
    document.body.appendChild(panel);
    panel.addEventListener('click', event => {
      const action = event.target.dataset.action;
      if (action === 'sequence') sequence();
      if (action === 'reset') reset();
    });
    sequence();
  }
};
