const ResultCore = {
  matchKey(s) {
    return JSON.stringify([String(s.event?.round??''),String(s.event?.game??''),
      s.game?.matchSerial??0,s.fearless?.active?(s.fearless.id??''):(s.webDraft?.room??'')]);
  },
  isCurrent(s, snapshot=s.result?.snapshot) {
    if (!snapshot) return false;
    if (snapshot.matchKey) return snapshot.matchKey===this.matchKey(s);
    return String(snapshot.event?.game)===String(s.event?.game)&&
      (!snapshot.event?.round||snapshot.event.round===s.event?.round);
  },
  target(s) {
    return {matchKey:this.matchKey(s),savedAt:s.result?.snapshot?.savedAt??null};
  },
  sameTarget(s, target) {
    return Boolean(target&&target.matchKey===this.matchKey(s)&&target.savedAt===(s.result?.snapshot?.savedAt??null));
  },
  captureIssue(s) {
    if(!s.connection?.autoSync)return '';
    const draft=s.webDraft;
    if((draft?.enabled&&draft.status!=='complete')||s.liveMatch?.awaitingGame||
      (draft?.enabled&&s.liveMatch?.room&&s.liveMatch.room!==draft.room)){
      return '현재 세트의 인게임 데이터가 들어온 뒤 결과를 저장하세요.';
    }
    return '';
  },
  snapshot(s) {
    const {lineups,sidePanelRoster,liveFeed,resultDragons,...game}=s.game;
    if(resultDragons) for(const side of ['blue','red']){
      game[side+'DragonTypes']=resultDragons[side]||[];
      game[side+'Dragons']=game[side+'DragonTypes'].length;
    }
    const picks=side=>(lineups?.[side]??s.draft[side+'Picks']??[]).map(p=>({id:p.id,kda:p.kda}));
    return JSON.parse(JSON.stringify({
      savedAt:new Date().toISOString(), matchKey:this.matchKey(s),event:s.event, blue:s.blue, red:s.red, game,
      draft:{blueBans:s.draft.blueBans,redBans:s.draft.redBans,
        bluePicks:picks('blue'),redPicks:picks('red')}
    }));
  },
  kda(snapshot,side) {
    const override=snapshot.game[side+'Kda'];
    if(override)return override;
    const totals=(snapshot.draft[side+'Picks']||[]).reduce((a,p)=>{for(const key of ['kills','deaths','assists'])a[key]+=Number(p.kda?.[key])||0;return a},{kills:0,deaths:0,assists:0});
    return [totals.kills,totals.deaths,totals.assists].join('/');
  }
};
if(typeof window!=='undefined') window.ResultCore=ResultCore;
if(typeof module!=='undefined') module.exports=ResultCore;
