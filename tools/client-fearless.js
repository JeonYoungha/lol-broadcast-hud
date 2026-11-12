function capture(state,picks){
 const ids=picks.map(Number);
 if(ids.length!==10||ids.some(id=>!Number.isInteger(id)||id<=0)||new Set(ids).size!==10)return false;
 const history=state.clientFearless||(state.clientFearless={games:[],pending:null});
 if(history.pending)return false;
 history.pending={picks:ids};return true;
}
function nextDraft(state){
 const history=state.clientFearless;if(!history?.pending)return false;
 history.games=Array.isArray(history.games)?history.games:[];
 history.games.push({game:history.games.length+1,picks:history.pending.picks});history.pending=null;return true;
}
function reset(state){state.clientFearless={games:[],pending:null}}
module.exports={capture,nextDraft,reset};
