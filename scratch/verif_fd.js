const http = require('http');
const get = (p) => new Promise((res,rej)=>{http.get('http://localhost:3002'+p,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej)});
const len = j => j.success? j.data.length : ('ERR:'+j.message);
(async()=>{
  const T=10;
  // Plantilla scope (una sola query de resumen)
  const rs = await get(`/api/adeudos/sedes?temporadaId=${T}`);
  const S = f => rs.data.reduce((a,s)=>a+(Number(s[f])||0),0);
  const scope = S('ActivosNormal')+S('ActivosKeepers')+S('ActivosFutsal');
  console.log('Plantilla scope (normal+keepers+futsal):', S('ActivosNormal'),'+',S('ActivosKeepers'),'+',S('ActivosFutsal'),'=',scope);
  console.log('Resumen deuda: debe',S('ActualDebe'),'+ futsalDebe',S('ActualFutsalDebe'),'+ alCorr',S('ActualAlCorriente'),'+ porteros',S('ActualKeepers'),'+ futsalCorr',S('ActualFutsal'),'+ becados',S('ActualBecadosSinInscripcion'),'=',S('ActualDebe')+S('ActualFutsalDebe')+S('ActualAlCorriente')+S('ActualKeepers')+S('ActualFutsal')+S('ActualBecadosSinInscripcion'));
  // Chequeo: futsal plantilla vs futsalDebe+futsalCorr
  console.log('Futsal plantilla:',S('ActivosFutsal'),'| futsalDebe+futsalCorr:',S('ActualFutsalDebe')+S('ActualFutsal'));
  // Debt cuts via players route (misma foto)
  const d=len(await get(`/api/adeudos/players?filtro=debe&temporadaId=${T}`));
  const fd=len(await get(`/api/adeudos/players?filtro=futsal-debe&temporadaId=${T}`));
  console.log('Players route: debe',d,'futsalDebe',fd,'(resumen debe',S('ActualDebe'),'futsalDebe',S('ActualFutsalDebe'),')');
  // Buscar solapamiento keeper+futsal
  const kf = (await get(`/api/adeudos/players?filtro=futsal-debe&temporadaId=${T}`)).data.filter(p=>p.EsKeeperOPortero).length;
  console.log('futsal-debe que tambien son keeper (deben ser 0):', kf);
})().catch(e=>{console.error(e);process.exit(1)});
