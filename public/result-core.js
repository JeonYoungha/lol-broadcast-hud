window.ResultCore = {
  snapshot(s) {
    return JSON.parse(JSON.stringify({
      savedAt:new Date().toISOString(), event:s.event, blue:s.blue, red:s.red, game:s.game,
      draft:{blueBans:s.draft.blueBans,redBans:s.draft.redBans,
        bluePicks:(s.draft.bluePicks||[]).map(p=>({id:p.id,kda:p.kda})),
        redPicks:(s.draft.redPicks||[]).map(p=>({id:p.id,kda:p.kda}))}
    }));
  },
  kda(snapshot,side) {
    const override=snapshot.game[side+'Kda'];
    if(override)return override;
    const totals=(snapshot.draft[side+'Picks']||[]).reduce((a,p)=>{for(const key of ['kills','deaths','assists'])a[key]+=Number(p.kda?.[key])||0;return a},{kills:0,deaths:0,assists:0});
    return [totals.kills,totals.deaths,totals.assists].join('/');
  }
};
